// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertusSponsoredYieldVault} from "../src/CertusSponsoredYieldVault.sol";
import {TestToken} from "./CertusEscrow.t.sol";

contract CertusSponsoredYieldVaultTest is Test {
    TestToken private token;
    CertusSponsoredYieldVault private vault;
    address private user = address(0xBEEF);
    bytes32 private constant REASON = keccak256("CVI_REVOKED");

    function setUp() public {
        token = new TestToken();
        vault = new CertusSponsoredYieldVault(address(token));
        token.mint(address(this), 10_000_000);
        token.mint(user, 10_000_000);
        token.approve(address(vault), type(uint256).max);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vault.fundReserve(1_000_000);
    }

    function test_depositAccruesAndWithdrawsSponsoredBonus() public {
        vm.prank(user);
        vault.deposit(10_000_000);
        vm.roll(block.number + 100);
        (uint256 principal, uint256 bonus,, bool active, bool frozen) = vault.positionOf(user);
        assertEq(principal, 10_000_000);
        assertGt(bonus, 0);
        assertTrue(active);
        assertFalse(frozen);
        uint256 before = token.balanceOf(user);
        vm.prank(user);
        vault.withdraw();
        assertGt(token.balanceOf(user), before + 10_000_000);
    }

    function test_freezeStopsBonusAndBlocksWithdrawal() public {
        vm.prank(user);
        vault.deposit(10_000_000);
        vm.roll(block.number + 100);
        uint256 before = vault.previewBonus(user);
        vault.freeze(user, REASON);
        vm.roll(block.number + 10_000);
        assertEq(vault.previewBonus(user), before);
        vm.prank(user);
        vm.expectRevert(CertusSponsoredYieldVault.Frozen.selector);
        vault.withdraw();
    }
}
