// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertusEscrow} from "../src/CertusEscrow.sol";
import {MockYieldVault} from "../src/MockYieldVault.sol";
import {TestToken} from "./CertusEscrow.t.sol";

contract MockYieldVaultTest is Test {
    TestToken private token;
    CertusEscrow private escrow;
    MockYieldVault private vault;

    address private funder = address(0xF00D);
    address private recipient = address(0xA11CE);
    bytes32 private constant INTENT = keccak256("yield-intent");
    bytes32 private constant AUDIT = keccak256("audit");
    bytes32 private constant REASON = keccak256("CVI_REVOKED_OR_EXPIRED");

    function setUp() public {
        token = new TestToken();
        escrow = new CertusEscrow(address(token));
        vault = new MockYieldVault(address(token), address(escrow));
        escrow.setYieldVault(address(vault));

        token.mint(funder, 20_000_000);
        token.mint(address(vault), 20_000_000); // explicit mock yield reserve
        vm.prank(funder);
        token.approve(address(escrow), type(uint256).max);
    }

    function _fund() private {
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        recipients[0] = recipient;
        recipients[1] = recipient;
        amounts[0] = 10_000_000;
        amounts[1] = 10_000_000;
        vm.prank(funder);
        escrow.fundIntent(INTENT, recipients, amounts);
    }

    function test_vaultBackedReleasePaysRecipient() public {
        _fund();
        assertEq(token.balanceOf(address(escrow)), 0, "idle principal should enter vault");

        vm.roll(block.number + 25);
        escrow.releaseLeg(INTENT, 0, AUDIT);

        assertEq(token.balanceOf(recipient), 10_000_000);
        (uint256 principal, uint256 yieldAccrued,, bool active,) = vault.positionOf(INTENT);
        assertEq(principal, 10_000_000);
        assertGt(yieldAccrued, 0);
        assertTrue(active);
    }

    function test_vaultCannotBeSelectedAfterFundingStarts() public {
        CertusEscrow directEscrow = new CertusEscrow(address(token));
        vm.prank(funder);
        token.approve(address(directEscrow), type(uint256).max);

        address[] memory recipients = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        recipients[0] = recipient;
        amounts[0] = 1_000_000;
        vm.prank(funder);
        directEscrow.fundIntent(keccak256("direct-intent"), recipients, amounts);

        MockYieldVault lateVault = new MockYieldVault(address(token), address(directEscrow));
        vm.expectRevert(CertusEscrow.FundingAlreadyStarted.selector);
        directEscrow.setYieldVault(address(lateVault));
    }

    function test_freezeStopsYieldAtExactFreezeBlock() public {
        _fund();
        vm.roll(block.number + 100);

        uint256 yieldAtFreeze = vault.previewYield(INTENT);
        assertGt(yieldAtFreeze, 0, "yield must accrue before freeze");
        escrow.freezeIntent(INTENT, REASON, AUDIT);

        assertEq(escrow.quarantinedOf(INTENT), 20_000_000);
        assertEq(escrow.quarantinedYieldOf(INTENT), yieldAtFreeze);
        (uint256 principal, uint256 frozenYield,, bool active, bool frozen) = vault.positionOf(INTENT);
        assertEq(principal, 20_000_000);
        assertEq(frozenYield, yieldAtFreeze);
        assertFalse(active);
        assertTrue(frozen);

        vm.roll(block.number + 10_000);
        assertEq(vault.previewYield(INTENT), yieldAtFreeze, "yield changed after freeze block");
        assertEq(escrow.quarantinedYieldOf(INTENT), yieldAtFreeze, "quarantined yield changed");
    }

    function test_frozenVaultCannotReleasePrincipalOrYield() public {
        _fund();
        vm.roll(block.number + 50);
        escrow.freezeIntent(INTENT, REASON, AUDIT);
        uint256 held = token.balanceOf(address(vault));

        vm.expectRevert(CertusEscrow.IntentNotActive.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);
        vm.expectRevert(MockYieldVault.OnlyEscrow.selector);
        vault.release(INTENT, funder, 1);

        assertEq(token.balanceOf(address(vault)), held);
        assertEq(token.balanceOf(funder), 0);
        assertEq(token.balanceOf(recipient), 0);
    }
}
