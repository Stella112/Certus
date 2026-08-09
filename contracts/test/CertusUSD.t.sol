// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertusUSD} from "../src/CertusUSD.sol";

contract CertusUSDTest is Test {
    CertusUSD token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        token = new CertusUSD();
    }

    function test_metadataAndOwner() public view {
        assertEq(token.name(), "Certus USD");
        assertEq(token.symbol(), "cUSD");
        assertEq(token.decimals(), 6);
        assertEq(token.owner(), address(this));
    }

    function test_ownerMintsAndHolderTransfers() public {
        token.mint(alice, 10_000_000);
        vm.prank(alice);
        token.transfer(bob, 1_000_000);
        assertEq(token.balanceOf(alice), 9_000_000);
        assertEq(token.balanceOf(bob), 1_000_000);
    }

    function test_nonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(CertusUSD.NotOwner.selector);
        token.mint(alice, 1);
    }

    function test_transferFromHonorsAllowance() public {
        token.mint(alice, 2_000_000);
        vm.prank(alice);
        token.approve(bob, 1_000_000);
        vm.prank(bob);
        token.transferFrom(alice, bob, 1_000_000);
        assertEq(token.balanceOf(bob), 1_000_000);
        assertEq(token.allowance(alice, bob), 0);
    }

    function test_ownershipTransferMovesMintAuthority() public {
        token.transferOwnership(alice);
        vm.expectRevert(CertusUSD.NotOwner.selector);
        token.mint(bob, 1);
        vm.prank(alice);
        token.mint(bob, 1);
        assertEq(token.balanceOf(bob), 1);
    }
}
