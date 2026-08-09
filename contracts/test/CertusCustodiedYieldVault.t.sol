// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertusCustodiedYieldVault} from "../src/CertusCustodiedYieldVault.sol";
import {TestToken} from "./CertusEscrow.t.sol";

contract CertusCustodiedYieldVaultTest is Test {
    TestToken private token;
    CertusCustodiedYieldVault private pilot;
    address private user = address(0xBEEF);
    bytes32 private constant REASON = keccak256("CVI_REVOKED");

    function setUp() public {
        token = new TestToken();
        pilot = new CertusCustodiedYieldVault(address(token), address(this));
        token.mint(address(this), 10_000_000);
        token.mint(user, 10_000_000);
        token.approve(address(pilot), type(uint256).max);
        vm.prank(user);
        token.approve(address(pilot), type(uint256).max);
    }

    function test_custodiedDepositAccruesAndWithdrawsBonus() public {
        vm.prank(user);
        pilot.deposit(10_000_000);
        assertEq(pilot.totalPrincipal(), 10_000_000);
        vm.roll(block.number + 100);
        (uint256 principal, uint256 bonus,, bool active, bool frozen) = pilot.positionOf(user);
        assertEq(principal, 10_000_000);
        assertGt(bonus, 0);
        assertTrue(active);
        assertFalse(frozen);
        uint256 before = token.balanceOf(user);
        vm.prank(user);
        pilot.withdraw();
        assertGt(token.balanceOf(user), before + 10_000_000);
        assertEq(pilot.totalPrincipal(), 0);
    }

    function test_freezeStopsBonusAndBlocksWithdrawal() public {
        vm.prank(user);
        pilot.deposit(10_000_000);
        vm.roll(block.number + 100);
        uint256 before = pilot.previewBonus(user);
        pilot.freeze(user, REASON);
        vm.roll(block.number + 10_000);
        assertEq(pilot.previewBonus(user), before);
        vm.prank(user);
        vm.expectRevert(CertusCustodiedYieldVault.Frozen.selector);
        pilot.withdraw();
    }
}
