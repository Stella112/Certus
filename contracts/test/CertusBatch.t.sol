// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertusBatch} from "../src/CertusBatch.sol";

contract BatchTestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract CertusBatchTest is Test {
    CertusBatch batch;
    BatchTestToken token;
    address funder = address(0xF00D);
    address releaser = address(0xBEEF);
    bytes32 constant BATCH_ID = keccak256("moment-a-batch");
    bytes32 constant AUDIT = keccak256("audit");
    bytes32 constant NO_CVI = keccak256("NO_CVI");

    function setUp() public {
        token = new BatchTestToken();
        batch = new CertusBatch(address(token));
        batch.setReleaser(releaser, true);
        token.mint(funder, 100);
        vm.prank(funder);
        token.approve(address(batch), type(uint256).max);
    }

    function _fundTen() internal {
        address[] memory recipients = new address[](10);
        uint256[] memory amounts = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            recipients[i] = address(uint160(0x1000 + i));
            amounts[i] = 10;
        }
        vm.prank(funder);
        batch.fundBatch(BATCH_ID, recipients, amounts);
    }

    function test_fundBatch_rejectsZeroRecipient() public {
        address[] memory recipients = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        recipients[0] = address(0);
        amounts[0] = 1;
        vm.prank(funder);
        vm.expectRevert(CertusBatch.ZeroRecipient.selector);
        batch.fundBatch(BATCH_ID, recipients, amounts);
    }

    function test_momentA_nineSettleOneIsolatesAndBatchCompletes() public {
        _fundTen();

        // Red row first, then prove every later clean row still settles.
        vm.prank(releaser);
        batch.isolateRow(BATCH_ID, 4, NO_CVI, AUDIT);
        for (uint256 i = 0; i < 10; i++) {
            if (i == 4) continue;
            vm.prank(releaser);
            batch.releaseRow(BATCH_ID, i, AUDIT);
        }

        (
            ,
            uint256 total,
            uint256 released,
            uint256 quarantined,
            uint256 processed,
            CertusBatch.BatchStatus status
        ) = batch.getBatch(BATCH_ID);
        assertEq(total, 100);
        assertEq(released, 90);
        assertEq(quarantined, 10);
        assertEq(processed, 10);
        assertEq(uint256(status), uint256(CertusBatch.BatchStatus.Completed));
        assertEq(token.balanceOf(address(batch)), 10, "only isolated value remains");
        assertEq(batch.totalQuarantined(), 10);

        for (uint256 i = 0; i < 10; i++) {
            (, uint256 amount, CertusBatch.RowStatus rowStatus, bytes32 reason) = batch.getRow(BATCH_ID, i);
            assertEq(amount, 10);
            if (i == 4) {
                assertEq(uint256(rowStatus), uint256(CertusBatch.RowStatus.Isolated));
                assertEq(reason, NO_CVI);
            } else {
                assertEq(uint256(rowStatus), uint256(CertusBatch.RowStatus.Released));
                assertEq(token.balanceOf(address(uint160(0x1000 + i))), 10);
            }
        }
    }

    function test_isolatedRowCannotBeReleasedLater() public {
        _fundTen();
        vm.prank(releaser);
        batch.isolateRow(BATCH_ID, 4, NO_CVI, AUDIT);
        vm.prank(releaser);
        vm.expectRevert(CertusBatch.RowNotPending.selector);
        batch.releaseRow(BATCH_ID, 4, AUDIT);
    }

    function test_oneReleasedRowCannotBeIsolatedLater() public {
        _fundTen();
        vm.prank(releaser);
        batch.releaseRow(BATCH_ID, 0, AUDIT);
        vm.prank(releaser);
        vm.expectRevert(CertusBatch.RowNotPending.selector);
        batch.isolateRow(BATCH_ID, 0, NO_CVI, AUDIT);
    }

    function test_nonReleaserCannotSettleOrIsolate() public {
        _fundTen();
        address outsider = address(0xBAD);
        vm.prank(outsider);
        vm.expectRevert(CertusBatch.NotReleaser.selector);
        batch.releaseRow(BATCH_ID, 0, AUDIT);
        vm.prank(outsider);
        vm.expectRevert(CertusBatch.NotReleaser.selector);
        batch.isolateRow(BATCH_ID, 0, NO_CVI, AUDIT);
    }

    function test_duplicateBatchRejected() public {
        _fundTen();
        address[] memory recipients = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        recipients[0] = address(1);
        amounts[0] = 1;
        vm.prank(funder);
        vm.expectRevert(CertusBatch.BatchExists.selector);
        batch.fundBatch(BATCH_ID, recipients, amounts);
    }
}
