// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IYieldVault {
    function token() external view returns (address);
    function deposit(bytes32 intentId, uint256 amount) external;
    function release(bytes32 intentId, address recipient, uint256 amount) external;
    function freeze(bytes32 intentId) external returns (uint256 accruedYield);
}

/**
 * @title CertusEscrow
 * @notice Milestone escrow with mid-contract freeze and terminal quarantine.
 *
 * CUSTODY DESIGN:
 * The token is selected at deployment. The active Monad deployment custodies a verified
 * Cleanverse A-Token and has its own A-Pass. This was proven live: eligible releases succeed while an
 * attempted release to a no-A-Pass recipient reverts inside the A-Token. The earlier origin
 * USDC deployment remains as legacy evidence only; see deployments/monad.json.
 *
 * WHERE COMPLIANCE ACTUALLY LIVES, stated plainly rather than implied:
 * This contract does not evaluate the full compliance policy. The four-check pipeline runs
 * off-chain in evaluate() and must return PASS before the releaser signs a release. The
 * contract's job is custody, staging, and an immutable on-chain record. Two things keep that
 * honest:
 *   1. release() is restricted to the releaser role, so there is no public path around the
 *      pipeline.
 *   2. on the verified A-Token deployment, the asset independently gates both holder addresses; and
 *   3. every release and freeze carries an `auditRef`, the hash of the audit event that
 *      authorised it, emitted in the log. Anyone can tie an on-chain settlement back to the
 *      compliance record that permitted it, rather than taking our word for it.
 *
 * QUARANTINE IS NOT REFUND:
 * There is deliberately no refund, withdraw, sweep, or rescue function anywhere in this
 * contract. Once an intent is frozen, its remaining principal can reach neither the recipient
 * nor the funder. Funds sit in a compliance hold with lineage intact. The absence of an exit
 * is the feature; adding one would falsify the product's central claim.
 */
contract CertusEscrow {
    // --- types ---

    enum LegStatus {
        Pending,
        Released,
        Frozen
    }

    enum IntentStatus {
        None,
        Active,
        Completed,
        Frozen
    }

    struct Leg {
        address recipient;
        uint256 amount;
        LegStatus status;
    }

    struct Intent {
        address funder;
        uint256 total;
        uint256 released;
        IntentStatus status;
        bytes32 freezeReason;
    }

    // --- storage ---

    IERC20 public immutable token;
    address public owner;
    mapping(address => bool) public isReleaser;
    IYieldVault public yieldVault;
    uint256 public intentCount;

    mapping(bytes32 => Intent) private _intents;
    mapping(bytes32 => Leg[]) private _legs;

    /// @notice Principal held under compliance hold. Can never leave this contract.
    uint256 public totalQuarantined;
    uint256 public totalYieldQuarantined;
    mapping(bytes32 => uint256) public quarantinedYieldOf;

    // --- events ---

    event IntentFunded(bytes32 indexed intentId, address indexed funder, uint256 total, uint256 legCount);
    event LegReleased(
        bytes32 indexed intentId,
        uint256 indexed legIndex,
        address indexed recipient,
        uint256 amount,
        bytes32 auditRef
    );
    event IntentFrozen(bytes32 indexed intentId, uint256 quarantined, bytes32 reasonCode, bytes32 auditRef);
    event IntentCompleted(bytes32 indexed intentId);
    event ReleaserSet(address indexed account, bool allowed);
    event YieldVaultSet(address indexed vault);
    event YieldQuarantined(bytes32 indexed intentId, uint256 amount);

    // --- errors ---

    error NotOwner();
    error NotReleaser();
    error IntentExists();
    error UnknownIntent();
    error IntentNotActive();
    error LegNotPending();
    error BadLegIndex();
    error NoLegs();
    error ZeroAmount();
    error ZeroRecipient();
    error TransferFailed();
    error YieldVaultAlreadySet();
    error YieldVaultTokenMismatch();
    error FundingAlreadyStarted();

    // --- modifiers ---

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReleaser() {
        if (!isReleaser[msg.sender]) revert NotReleaser();
        _;
    }

    constructor(address token_) {
        token = IERC20(token_);
        owner = msg.sender;
        isReleaser[msg.sender] = true;
        emit ReleaserSet(msg.sender, true);
    }

    // --- admin ---

    function setReleaser(address account, bool allowed) external onlyOwner {
        isReleaser[account] = allowed;
        emit ReleaserSet(account, allowed);
    }

    /// @notice Opt into the testnet yield path before funding any vault-backed intent.
    /// @dev The vault is immutable after selection so custody cannot be redirected later.
    function setYieldVault(address vault) external onlyOwner {
        if (address(yieldVault) != address(0)) revert YieldVaultAlreadySet();
        if (intentCount != 0) revert FundingAlreadyStarted();
        if (IYieldVault(vault).token() != address(token)) revert YieldVaultTokenMismatch();
        yieldVault = IYieldVault(vault);
        emit YieldVaultSet(vault);
    }

    // --- funding ---

    /**
     * @notice Lock funds for a milestone intent. Pulls the full total up front, so a release
     *         can never fail for lack of funds after the pipeline has already said PASS.
     * @dev The caller must have approved this contract for `sum(amounts)` first.
     */
    function fundIntent(bytes32 intentId, address[] calldata recipients, uint256[] calldata amounts)
        external
    {
        if (_intents[intentId].status != IntentStatus.None) revert IntentExists();
        if (recipients.length == 0 || recipients.length != amounts.length) revert NoLegs();

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroRecipient();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
            _legs[intentId].push(
                Leg({recipient: recipients[i], amount: amounts[i], status: LegStatus.Pending})
            );
        }

        _intents[intentId] = Intent({
            funder: msg.sender,
            total: total,
            released: 0,
            status: IntentStatus.Active,
            freezeReason: bytes32(0)
        });
        intentCount += 1;

        if (!token.transferFrom(msg.sender, address(this), total)) revert TransferFailed();

        if (address(yieldVault) != address(0)) {
            if (!token.approve(address(yieldVault), total)) revert TransferFailed();
            yieldVault.deposit(intentId, total);
        }

        emit IntentFunded(intentId, msg.sender, total, recipients.length);
    }

    // --- settlement ---

    /**
     * @notice Release one milestone leg. MUST only be called after evaluate() returned PASS
     *         for this exact leg; `auditRef` is the hash of that audit event.
     * @dev A frozen intent can never reach this: the IntentNotActive check is what makes the
     *      freeze cascade real on chain rather than merely in the database.
     */
    function releaseLeg(bytes32 intentId, uint256 legIndex, bytes32 auditRef) external onlyReleaser {
        Intent storage intent = _intents[intentId];
        if (intent.status == IntentStatus.None) revert UnknownIntent();
        if (intent.status != IntentStatus.Active) revert IntentNotActive();
        if (legIndex >= _legs[intentId].length) revert BadLegIndex();

        Leg storage leg = _legs[intentId][legIndex];
        if (leg.status != LegStatus.Pending) revert LegNotPending();

        leg.status = LegStatus.Released;
        intent.released += leg.amount;

        if (address(yieldVault) == address(0)) {
            if (!token.transfer(leg.recipient, leg.amount)) revert TransferFailed();
        } else {
            yieldVault.release(intentId, leg.recipient, leg.amount);
        }

        emit LegReleased(intentId, legIndex, leg.recipient, leg.amount, auditRef);

        if (intent.released == intent.total) {
            intent.status = IntentStatus.Completed;
            emit IntentCompleted(intentId);
        }
    }

    /**
     * @notice Freeze an intent because a counterparty credential was revoked mid-contract.
     *         Every pending leg becomes Frozen and the unreleased principal is quarantined.
     *
     *         This is Moment B on chain. After this call there is no function in this
     *         contract, for any caller including the owner, that moves the quarantined
     *         principal anywhere. Not to the recipient, not back to the funder.
     */
    function freezeIntent(bytes32 intentId, bytes32 reasonCode, bytes32 auditRef) external onlyReleaser {
        Intent storage intent = _intents[intentId];
        if (intent.status == IntentStatus.None) revert UnknownIntent();
        if (intent.status != IntentStatus.Active) revert IntentNotActive();

        intent.status = IntentStatus.Frozen;
        intent.freezeReason = reasonCode;

        Leg[] storage legs = _legs[intentId];
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].status == LegStatus.Pending) {
                legs[i].status = LegStatus.Frozen;
            }
        }

        uint256 quarantined = intent.total - intent.released;
        totalQuarantined += quarantined;

        if (address(yieldVault) != address(0)) {
            uint256 quarantinedYield = yieldVault.freeze(intentId);
            quarantinedYieldOf[intentId] = quarantinedYield;
            totalYieldQuarantined += quarantinedYield;
            emit YieldQuarantined(intentId, quarantinedYield);
        }

        emit IntentFrozen(intentId, quarantined, reasonCode, auditRef);
    }

    // --- views ---

    function getIntent(bytes32 intentId)
        external
        view
        returns (address funder, uint256 total, uint256 released, IntentStatus status, bytes32 freezeReason)
    {
        Intent storage i = _intents[intentId];
        return (i.funder, i.total, i.released, i.status, i.freezeReason);
    }

    function legCount(bytes32 intentId) external view returns (uint256) {
        return _legs[intentId].length;
    }

    function getLeg(bytes32 intentId, uint256 legIndex)
        external
        view
        returns (address recipient, uint256 amount, LegStatus status)
    {
        if (legIndex >= _legs[intentId].length) revert BadLegIndex();
        Leg storage l = _legs[intentId][legIndex];
        return (l.recipient, l.amount, l.status);
    }

    /// @notice Principal still under compliance hold for one intent.
    function quarantinedOf(bytes32 intentId) external view returns (uint256) {
        Intent storage i = _intents[intentId];
        if (i.status != IntentStatus.Frozen) return 0;
        return i.total - i.released;
    }
}
