// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20CustodiedYield {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title CertusCustodiedYieldVault
 * @notice Testnet-only sponsored yield pilot for identity-gated assets.
 * @dev Canonical aUSDC rejects arbitrary contracts as holders. This pilot keeps
 *      principal in the A-Pass-verified custodian EOA and uses this contract as
 *      the auditable position and payout controller. It is intentionally
 *      custodial, bounded, and not protocol-generated yield or an APY promise.
 */
contract CertusCustodiedYieldVault {
    uint256 public constant RATE_PER_BLOCK = 1e14;
    uint256 public constant MAX_BONUS_BPS = 500;

    struct Position {
        uint256 principal;
        uint256 accruedBonus;
        uint256 lastAccrualBlock;
        bool active;
        bool frozen;
    }

    IERC20CustodiedYield public immutable token;
    address public immutable owner;
    uint256 public totalPrincipal;
    mapping(address => Position) private _positions;

    event Deposited(address indexed account, uint256 amount, address indexed custodian);
    event Withdrawn(address indexed account, uint256 principal, uint256 bonus, address indexed custodian);
    event PositionFrozen(address indexed account, uint256 principal, uint256 bonus, bytes32 reasonCode);

    error NotOwner();
    error ZeroAmount();
    error Frozen();
    error Inactive();
    error InsufficientCustody();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address token_, address custodian_) {
        if (token_ == address(0) || custodian_ == address(0)) revert ZeroAmount();
        token = IERC20CustodiedYield(token_);
        owner = custodian_;
    }

    /**
     * Available sponsor balance is the custodian's live token balance less
     * principal already owed to active positions. The custodian must approve
     * this contract before any withdrawal can be paid.
     */
    function reserve() public view returns (uint256) {
        uint256 balance = token.balanceOf(owner);
        return balance > totalPrincipal ? balance - totalPrincipal : 0;
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Position storage position = _positions[msg.sender];
        if (position.frozen) revert Frozen();
        _accrue(position);
        // The recipient is the verified custodian EOA, not this contract.
        if (!token.transferFrom(msg.sender, owner, amount)) revert TransferFailed();
        position.principal += amount;
        position.lastAccrualBlock = block.number;
        position.active = true;
        totalPrincipal += amount;
        emit Deposited(msg.sender, amount, owner);
    }

    function withdraw() external returns (uint256 principal, uint256 bonus) {
        Position storage position = _positions[msg.sender];
        if (position.frozen) revert Frozen();
        if (!position.active) revert Inactive();
        _accrue(position);
        principal = position.principal;
        bonus = position.accruedBonus;
        if (token.balanceOf(owner) < principal + bonus) revert InsufficientCustody();
        delete _positions[msg.sender];
        totalPrincipal -= principal;
        // The custodian approves this contract once; the token still checks
        // that the recipient is a currently eligible A-Pass wallet.
        if (!token.transferFrom(owner, msg.sender, principal + bonus)) revert TransferFailed();
        emit Withdrawn(msg.sender, principal, bonus, owner);
    }

    function freeze(address account, bytes32 reasonCode) external onlyOwner {
        Position storage position = _positions[account];
        if (!position.active) revert Inactive();
        _accrue(position);
        position.active = false;
        position.frozen = true;
        emit PositionFrozen(account, position.principal, position.accruedBonus, reasonCode);
    }

    function previewBonus(address account) public view returns (uint256) {
        Position storage position = _positions[account];
        if (!position.active) return position.accruedBonus;
        uint256 elapsed = block.number - position.lastAccrualBlock;
        uint256 bonus = position.accruedBonus + (position.principal * RATE_PER_BLOCK * elapsed) / 1e18;
        uint256 cap = (position.principal * MAX_BONUS_BPS) / 10_000;
        return bonus > cap ? cap : bonus;
    }

    function positionOf(address account)
        external
        view
        returns (uint256 principal, uint256 bonus, uint256 lastAccrualBlock, bool active, bool frozen)
    {
        Position storage position = _positions[account];
        return (position.principal, previewBonus(account), position.lastAccrualBlock, position.active, position.frozen);
    }

    function _accrue(Position storage position) private {
        if (!position.active) return;
        uint256 elapsed = block.number - position.lastAccrualBlock;
        if (elapsed == 0) return;
        uint256 cap = (position.principal * MAX_BONUS_BPS) / 10_000;
        uint256 next = position.accruedBonus + (position.principal * RATE_PER_BLOCK * elapsed) / 1e18;
        position.accruedBonus = next > cap ? cap : next;
        position.lastAccrualBlock = block.number;
    }
}
