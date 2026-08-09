// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBatchERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title CertusBatch
 * @notice Independently settles or isolates every address in a funded disbursal.
 *
 * Compliance is evaluated off chain immediately before each action. Only the designated
 * releaser can submit the resulting PASS or ISOLATE decision, and every action carries the
 * immutable audit-record hash that authorised it. A bad row cannot revert or freeze any
 * other row: it is terminally isolated and its value remains quarantined in this contract.
 *
 * There is deliberately no refund, sweep, rescue, or isolated-value withdrawal function.
 */
contract CertusBatch {
    enum RowStatus {
        Pending,
        Released,
        Isolated
    }

    enum BatchStatus {
        None,
        Active,
        Completed
    }

    struct Row {
        address recipient;
        uint256 amount;
        RowStatus status;
        bytes32 reasonCode;
    }

    struct Batch {
        address funder;
        uint256 total;
        uint256 released;
        uint256 quarantined;
        uint256 processed;
        BatchStatus status;
    }

    IBatchERC20 public immutable token;
    address public owner;
    mapping(address => bool) public isReleaser;
    mapping(bytes32 => Batch) private _batches;
    mapping(bytes32 => Row[]) private _rows;
    uint256 public totalQuarantined;

    event ReleaserSet(address indexed account, bool allowed);
    event BatchFunded(bytes32 indexed batchId, address indexed funder, uint256 total, uint256 rowCount);
    event RowReleased(
        bytes32 indexed batchId,
        uint256 indexed rowIndex,
        address indexed recipient,
        uint256 amount,
        bytes32 auditRef
    );
    event RowIsolated(
        bytes32 indexed batchId,
        uint256 indexed rowIndex,
        address indexed recipient,
        uint256 amount,
        bytes32 reasonCode,
        bytes32 auditRef
    );
    event BatchCompleted(bytes32 indexed batchId, uint256 released, uint256 quarantined);

    error NotOwner();
    error NotReleaser();
    error BatchExists();
    error UnknownBatch();
    error BatchNotActive();
    error RowNotPending();
    error BadRowIndex();
    error NoRows();
    error ZeroAmount();
    error ZeroRecipient();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReleaser() {
        if (!isReleaser[msg.sender]) revert NotReleaser();
        _;
    }

    constructor(address token_) {
        token = IBatchERC20(token_);
        owner = msg.sender;
        isReleaser[msg.sender] = true;
        emit ReleaserSet(msg.sender, true);
    }

    function setReleaser(address account, bool allowed) external onlyOwner {
        isReleaser[account] = allowed;
        emit ReleaserSet(account, allowed);
    }

    function fundBatch(bytes32 batchId, address[] calldata recipients, uint256[] calldata amounts) external {
        if (_batches[batchId].status != BatchStatus.None) revert BatchExists();
        if (recipients.length == 0 || recipients.length != amounts.length) revert NoRows();

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroRecipient();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
            _rows[batchId].push(
                Row({
                    recipient: recipients[i],
                    amount: amounts[i],
                    status: RowStatus.Pending,
                    reasonCode: bytes32(0)
                })
            );
        }
        _batches[batchId] = Batch({
            funder: msg.sender,
            total: total,
            released: 0,
            quarantined: 0,
            processed: 0,
            status: BatchStatus.Active
        });
        if (!token.transferFrom(msg.sender, address(this), total)) revert TransferFailed();
        emit BatchFunded(batchId, msg.sender, total, recipients.length);
    }

    function releaseRow(bytes32 batchId, uint256 rowIndex, bytes32 auditRef) external onlyReleaser {
        Batch storage batch = _activeBatch(batchId);
        Row storage row = _pendingRow(batchId, rowIndex);

        row.status = RowStatus.Released;
        batch.released += row.amount;
        batch.processed++;
        if (!token.transfer(row.recipient, row.amount)) revert TransferFailed();

        emit RowReleased(batchId, rowIndex, row.recipient, row.amount, auditRef);
        _completeIfDone(batchId, batch);
    }

    function isolateRow(bytes32 batchId, uint256 rowIndex, bytes32 reasonCode, bytes32 auditRef)
        external
        onlyReleaser
    {
        Batch storage batch = _activeBatch(batchId);
        Row storage row = _pendingRow(batchId, rowIndex);

        row.status = RowStatus.Isolated;
        row.reasonCode = reasonCode;
        batch.quarantined += row.amount;
        batch.processed++;
        totalQuarantined += row.amount;

        emit RowIsolated(batchId, rowIndex, row.recipient, row.amount, reasonCode, auditRef);
        _completeIfDone(batchId, batch);
    }

    function _activeBatch(bytes32 batchId) private view returns (Batch storage batch) {
        batch = _batches[batchId];
        if (batch.status == BatchStatus.None) revert UnknownBatch();
        if (batch.status != BatchStatus.Active) revert BatchNotActive();
    }

    function _pendingRow(bytes32 batchId, uint256 rowIndex) private view returns (Row storage row) {
        if (rowIndex >= _rows[batchId].length) revert BadRowIndex();
        row = _rows[batchId][rowIndex];
        if (row.status != RowStatus.Pending) revert RowNotPending();
    }

    function _completeIfDone(bytes32 batchId, Batch storage batch) private {
        if (batch.processed == _rows[batchId].length) {
            batch.status = BatchStatus.Completed;
            emit BatchCompleted(batchId, batch.released, batch.quarantined);
        }
    }

    function getBatch(bytes32 batchId)
        external
        view
        returns (
            address funder,
            uint256 total,
            uint256 released,
            uint256 quarantined,
            uint256 processed,
            BatchStatus status
        )
    {
        Batch storage batch = _batches[batchId];
        return (batch.funder, batch.total, batch.released, batch.quarantined, batch.processed, batch.status);
    }

    function rowCount(bytes32 batchId) external view returns (uint256) {
        return _rows[batchId].length;
    }

    function getRow(bytes32 batchId, uint256 rowIndex)
        external
        view
        returns (address recipient, uint256 amount, RowStatus status, bytes32 reasonCode)
    {
        if (rowIndex >= _rows[batchId].length) revert BadRowIndex();
        Row storage row = _rows[batchId][rowIndex];
        return (row.recipient, row.amount, row.status, row.reasonCode);
    }
}
