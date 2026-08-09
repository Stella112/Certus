// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20SponsoredYield {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title CertusSponsoredYieldVault
 * @notice TESTNET-ONLY sponsored yield demonstration.
 * @dev Deposits are real aUSDC. The bonus is paid from an owner-funded reserve;
 *      it is not protocol-generated yield and must never be presented as APY.
 */
contract CertusSponsoredYieldVault {
    uint256 public constant RATE_PER_BLOCK = 1e14;
    uint256 public constant MAX_BONUS_BPS = 500;

    struct Position {
        uint256 principal;
        uint256 accruedBonus;
        uint256 lastAccrualBlock;
        bool active;
        bool frozen;
    }

    IERC20SponsoredYield public immutable token;
    address public immutable owner;
    uint256 public reserve;
    mapping(address => Position) private _positions;

    event ReserveFunded(address indexed funder, uint256 amount);
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 principal, uint256 bonus);
    event PositionFrozen(address indexed account, uint256 principal, uint256 bonus, bytes32 reasonCode);

    error NotOwner();
    error ZeroAmount();
    error Frozen();
    error Inactive();
    error InsufficientReserve();
    error TransferFailed();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address token_) {
        token = IERC20SponsoredYield(token_);
        owner = msg.sender;
    }

    function fundReserve(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        reserve += amount;
        emit ReserveFunded(msg.sender, amount);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Position storage position = _positions[msg.sender];
        if (position.frozen) revert Frozen();
        _accrue(position);
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        position.principal += amount;
        position.lastAccrualBlock = block.number;
        position.active = true;
        emit Deposited(msg.sender, amount);
    }

    function withdraw() external returns (uint256 principal, uint256 bonus) {
        Position storage position = _positions[msg.sender];
        if (position.frozen) revert Frozen();
        if (!position.active) revert Inactive();
        _accrue(position);
        principal = position.principal;
        bonus = position.accruedBonus;
        if (bonus > reserve) revert InsufficientReserve();
        delete _positions[msg.sender];
        reserve -= bonus;
        if (!token.transfer(msg.sender, principal + bonus)) revert TransferFailed();
        emit Withdrawn(msg.sender, principal, bonus);
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

    function positionOf(address account) external view returns (uint256 principal, uint256 bonus, uint256 lastAccrualBlock, bool active, bool frozen) {
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
