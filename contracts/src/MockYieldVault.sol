// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IYieldToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title MockYieldVault
 * @notice TESTNET-ONLY fixed-rate yield simulation for Certus escrow demonstrations.
 * @dev This is not a production yield strategy. Yield is accounting backed by tokens seeded
 *      into this contract. A frozen position can never accrue again or move value.
 */
contract MockYieldVault {
    uint256 public constant RATE_PER_BLOCK = 1e14; // 0.01% of remaining principal per block

    struct Position {
        uint256 principal;
        uint256 accruedYield;
        uint256 lastAccrualBlock;
        bool active;
        bool frozen;
    }

    IYieldToken public immutable token;
    address public immutable escrow;
    mapping(bytes32 => Position) private _positions;

    event PrincipalDeposited(bytes32 indexed intentId, uint256 amount);
    event YieldTicked(bytes32 indexed intentId, uint256 accruedYield, uint256 blockNumber);
    event PrincipalReleased(bytes32 indexed intentId, address indexed recipient, uint256 amount);
    event PositionFrozen(
        bytes32 indexed intentId, uint256 principal, uint256 accruedYield, uint256 blockNumber
    );

    error OnlyEscrow();
    error PositionExists();
    error PositionNotActive();
    error InsufficientPrincipal();
    error TransferFailed();

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert OnlyEscrow();
        _;
    }

    constructor(address token_, address escrow_) {
        token = IYieldToken(token_);
        escrow = escrow_;
    }

    function deposit(bytes32 intentId, uint256 amount) external onlyEscrow {
        Position storage position = _positions[intentId];
        if (position.active || position.frozen || position.principal != 0) revert PositionExists();
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        position.principal = amount;
        position.lastAccrualBlock = block.number;
        position.active = true;
        emit PrincipalDeposited(intentId, amount);
    }

    /// @notice Materialize the fixed-rate accounting through the current block.
    function tick(bytes32 intentId) external returns (uint256) {
        Position storage position = _positions[intentId];
        if (!position.active) revert PositionNotActive();
        _accrue(intentId, position);
        return position.accruedYield;
    }

    function release(bytes32 intentId, address recipient, uint256 amount) external onlyEscrow {
        Position storage position = _positions[intentId];
        if (!position.active) revert PositionNotActive();
        if (amount > position.principal) revert InsufficientPrincipal();
        _accrue(intentId, position);
        position.principal -= amount;
        if (position.principal == 0) position.active = false;
        if (!token.transfer(recipient, amount)) revert TransferFailed();
        emit PrincipalReleased(intentId, recipient, amount);
    }

    function freeze(bytes32 intentId) external onlyEscrow returns (uint256 accruedYield) {
        Position storage position = _positions[intentId];
        if (!position.active) revert PositionNotActive();
        _accrue(intentId, position);
        position.active = false;
        position.frozen = true;
        accruedYield = position.accruedYield;
        emit PositionFrozen(intentId, position.principal, accruedYield, block.number);
    }

    function previewYield(bytes32 intentId) public view returns (uint256) {
        Position storage position = _positions[intentId];
        if (!position.active) return position.accruedYield;
        uint256 elapsed = block.number - position.lastAccrualBlock;
        return position.accruedYield + (position.principal * RATE_PER_BLOCK * elapsed) / 1e18;
    }

    function positionOf(bytes32 intentId)
        external
        view
        returns (uint256 principal, uint256 accruedYield, uint256 lastAccrualBlock, bool active, bool frozen)
    {
        Position storage position = _positions[intentId];
        return (
            position.principal,
            previewYield(intentId),
            position.lastAccrualBlock,
            position.active,
            position.frozen
        );
    }

    function _accrue(bytes32 intentId, Position storage position) private {
        uint256 elapsed = block.number - position.lastAccrualBlock;
        if (elapsed != 0) {
            position.accruedYield += (position.principal * RATE_PER_BLOCK * elapsed) / 1e18;
            position.lastAccrualBlock = block.number;
        }
        emit YieldTicked(intentId, position.accruedYield, block.number);
    }
}
