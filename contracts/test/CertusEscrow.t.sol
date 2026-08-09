// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertusEscrow} from "../src/CertusEscrow.sol";

/**
 * Minimal ERC20 for the TEST HARNESS ONLY.
 *
 * This is a test double, not a product mock. It never ships, is never deployed by any script,
 * and the deployed escrow points at the real Cleanverse origin USDC on Base Sepolia.
 * MockYieldVault remains the only simulated component in the product (DECISIONS.md D4).
 */
contract TestToken {
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
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract CertusEscrowTest is Test {
    CertusEscrow escrow;
    TestToken token;

    address funder = address(0xF00D);
    address releaser = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant INTENT = keccak256("intent-milestone-001");
    bytes32 constant AUDIT = keccak256("audit-event-1");
    bytes32 constant REASON = keccak256("CVI_REVOKED_OR_EXPIRED");

    function setUp() public {
        token = new TestToken();
        escrow = new CertusEscrow(address(token));
        escrow.setReleaser(releaser, true);

        token.mint(funder, 30_000_000); // 30 USDC at 6 decimals
        vm.prank(funder);
        token.approve(address(escrow), type(uint256).max);
    }

    function _fund() internal {
        address[] memory recipients = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        recipients[0] = alice;
        recipients[1] = alice;
        recipients[2] = alice;
        amounts[0] = 10_000_000;
        amounts[1] = 10_000_000;
        amounts[2] = 10_000_000;
        vm.prank(funder);
        escrow.fundIntent(INTENT, recipients, amounts);
    }

    // --- funding ---

    function test_fundIntent_locksFullTotalUpFront() public {
        _fund();
        assertEq(token.balanceOf(address(escrow)), 30_000_000, "escrow must hold the full total");
        assertEq(token.balanceOf(funder), 0);
        assertEq(escrow.legCount(INTENT), 3);
    }

    function test_fundIntent_rejectsDuplicateIntentId() public {
        _fund();
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        r[0] = bob;
        a[0] = 1;
        vm.prank(funder);
        vm.expectRevert(CertusEscrow.IntentExists.selector);
        escrow.fundIntent(INTENT, r, a);
    }

    function test_fundIntent_rejectsZeroRecipient() public {
        address[] memory recipients = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        recipients[0] = address(0);
        amounts[0] = 1;
        vm.prank(funder);
        vm.expectRevert(CertusEscrow.ZeroRecipient.selector);
        escrow.fundIntent(INTENT, recipients, amounts);
    }

    // --- release ---

    function test_releaseLeg_paysRecipientAndAdvances() public {
        _fund();
        vm.prank(releaser);
        escrow.releaseLeg(INTENT, 0, AUDIT);

        assertEq(token.balanceOf(alice), 10_000_000);
        assertEq(token.balanceOf(address(escrow)), 20_000_000);
        (,, uint256 released,,) = escrow.getIntent(INTENT);
        assertEq(released, 10_000_000);
    }

    function test_releaseLeg_onlyReleaser() public {
        _fund();
        vm.prank(alice); // a recipient must not be able to pay themselves
        vm.expectRevert(CertusEscrow.NotReleaser.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);
    }

    function test_releaseLeg_cannotDoubleRelease() public {
        _fund();
        vm.startPrank(releaser);
        escrow.releaseLeg(INTENT, 0, AUDIT);
        vm.expectRevert(CertusEscrow.LegNotPending.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);
        vm.stopPrank();
    }

    function test_intentCompletesAfterFinalLeg() public {
        _fund();
        vm.startPrank(releaser);
        escrow.releaseLeg(INTENT, 0, AUDIT);
        escrow.releaseLeg(INTENT, 1, AUDIT);
        escrow.releaseLeg(INTENT, 2, AUDIT);
        vm.stopPrank();
        (,,, CertusEscrow.IntentStatus status,) = escrow.getIntent(INTENT);
        assertEq(uint256(status), uint256(CertusEscrow.IntentStatus.Completed));
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    // --- MOMENT B: freeze ---

    function test_freeze_haltsRemainingMilestones() public {
        _fund();
        vm.startPrank(releaser);
        escrow.releaseLeg(INTENT, 0, AUDIT); // milestone 1 settles normally
        escrow.freezeIntent(INTENT, REASON, AUDIT); // credential revoked mid-contract

        // milestone 2 must now be impossible
        vm.expectRevert(CertusEscrow.IntentNotActive.selector);
        escrow.releaseLeg(INTENT, 1, AUDIT);
        vm.stopPrank();

        (,,, CertusEscrow.IntentStatus status, bytes32 reason) = escrow.getIntent(INTENT);
        assertEq(uint256(status), uint256(CertusEscrow.IntentStatus.Frozen));
        assertEq(reason, REASON, "freeze reason must be recorded on chain");
    }

    function test_freeze_marksEveryPendingLegFrozen() public {
        _fund();
        vm.startPrank(releaser);
        escrow.releaseLeg(INTENT, 0, AUDIT);
        escrow.freezeIntent(INTENT, REASON, AUDIT);
        vm.stopPrank();

        (,, CertusEscrow.LegStatus l0) = escrow.getLeg(INTENT, 0);
        (,, CertusEscrow.LegStatus l1) = escrow.getLeg(INTENT, 1);
        (,, CertusEscrow.LegStatus l2) = escrow.getLeg(INTENT, 2);
        assertEq(uint256(l0), uint256(CertusEscrow.LegStatus.Released), "settled leg stays settled");
        assertEq(uint256(l1), uint256(CertusEscrow.LegStatus.Frozen));
        assertEq(uint256(l2), uint256(CertusEscrow.LegStatus.Frozen));
    }

    function test_freeze_quarantinesUnreleasedPrincipal() public {
        _fund();
        vm.startPrank(releaser);
        escrow.releaseLeg(INTENT, 0, AUDIT);
        escrow.freezeIntent(INTENT, REASON, AUDIT);
        vm.stopPrank();

        assertEq(escrow.quarantinedOf(INTENT), 20_000_000);
        assertEq(escrow.totalQuarantined(), 20_000_000);
        assertEq(token.balanceOf(address(escrow)), 20_000_000, "funds stay in escrow");
    }

    function test_cannotFreezeTwice() public {
        _fund();
        vm.startPrank(releaser);
        escrow.freezeIntent(INTENT, REASON, AUDIT);
        vm.expectRevert(CertusEscrow.IntentNotActive.selector);
        escrow.freezeIntent(INTENT, REASON, AUDIT);
        vm.stopPrank();
    }

    // --- THE QUARANTINE INVARIANT (the property the product claim rests on) ---

    /**
     * Quarantine is not refund. Once frozen, the principal must reach NEITHER the recipient
     * NOR the funder, and no caller may extract it. This test enumerates every externally
     * reachable state-changing entry point and asserts the escrow balance is unchanged.
     */
    function test_INVARIANT_quarantinedFundsCannotLeave() public {
        _fund();
        vm.prank(releaser);
        escrow.freezeIntent(INTENT, REASON, AUDIT);

        uint256 held = token.balanceOf(address(escrow));
        assertEq(held, 30_000_000);

        // recipient cannot pull
        vm.prank(alice);
        vm.expectRevert(CertusEscrow.NotReleaser.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);

        // funder cannot claw back
        vm.prank(funder);
        vm.expectRevert(CertusEscrow.NotReleaser.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);

        // the releaser itself cannot release from a frozen intent
        vm.prank(releaser);
        vm.expectRevert(CertusEscrow.IntentNotActive.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);

        // even the owner has no path: there is no refund/withdraw/sweep function at all
        vm.prank(address(this));
        vm.expectRevert(CertusEscrow.IntentNotActive.selector);
        escrow.releaseLeg(INTENT, 0, AUDIT);

        assertEq(token.balanceOf(address(escrow)), held, "quarantined principal must not move");
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(funder), 0);
    }

    /// Fuzz: no leg index, from any caller, can drain a frozen intent.
    function testFuzz_INVARIANT_frozenIntentNeverPays(uint256 legIndex, address caller) public {
        _fund();
        vm.prank(releaser);
        escrow.freezeIntent(INTENT, REASON, AUDIT);

        uint256 before = token.balanceOf(address(escrow));
        vm.prank(caller);
        try escrow.releaseLeg(INTENT, legIndex, AUDIT) {
            fail();
        } catch {
            // expected for every caller and every index
        }
        assertEq(token.balanceOf(address(escrow)), before, "frozen escrow must never pay out");
    }
}
