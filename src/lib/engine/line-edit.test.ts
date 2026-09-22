import { describe, expect, it } from 'vitest';
import {
  MAX_WAVES,
  hasRowControls,
  invitationFlowHint,
  lineHasOrder,
  lineHasWaves,
  lineOrderNotice,
  rowEdits,
  wavesOffered,
  type LineInvite,
} from './line-edit';

/**
 * The regression suite for "Unable to reorder people in the queue."
 *
 * The control was there. What was missing was every case where it was not, and
 * nothing said why: a two-person plan, a wave plan, a plan still polling for its
 * date. So these tests walk the cases a host actually hits rather than the one
 * that happened to work, and assert the pair is either usable or explained.
 */

function invite(
  id: string,
  status: string,
  position: number,
  groupStage = 0,
): LineInvite {
  return { id, status, position, groupStage };
}

const EDITABLE = { mode: 'individual', editable: true };

describe('who can move in the line', () => {
  it('gives the middle of the line both directions', () => {
    const line = [
      invite('a', 'sent', 0),
      invite('b', 'queued', 1),
      invite('c', 'queued', 2),
      invite('d', 'queued', 3),
    ];
    const middle = rowEdits(line[2], line, EDITABLE);
    expect(middle.reorderable).toBe(true);
    expect(middle.moveEarlier).toBe(true);
    expect(middle.moveLater).toBe(true);
    expect(middle.queuePlace).toBe(2);
  });

  it('stops the ends of the queue from moving past them', () => {
    const line = [
      invite('a', 'sent', 0),
      invite('b', 'queued', 1),
      invite('c', 'queued', 2),
    ];
    expect(rowEdits(line[1], line, EDITABLE)).toMatchObject({
      reorderable: true,
      moveEarlier: false,
      moveLater: true,
      queuePlace: 1,
    });
    expect(rowEdits(line[2], line, EDITABLE)).toMatchObject({
      moveEarlier: true,
      moveLater: false,
      queuePlace: 2,
    });
  });

  it('ignores anyone who has already been asked or answered', () => {
    // The person currently being asked cannot be reordered: their invitation
    // has gone out. That is the one case where "no" is the right answer, and it
    // is the row's own state rather than a property of the line.
    const line = [
      invite('a', 'sent', 0),
      invite('b', 'accepted', 1),
      invite('c', 'queued', 2),
      invite('d', 'queued', 3),
    ];
    expect(rowEdits(line[0], line, EDITABLE).reorderable).toBe(false);
    expect(rowEdits(line[1], line, EDITABLE).reorderable).toBe(false);
    expect(rowEdits(line[2], line, EDITABLE).queuePlace).toBe(1);
  });

  it('reads the line by position, not by the order the rows arrived', () => {
    const line = [
      invite('c', 'queued', 9),
      invite('a', 'queued', 2),
      invite('b', 'queued', 5),
    ];
    expect(rowEdits(line[1], line, EDITABLE).queuePlace).toBe(1);
    expect(rowEdits(line[2], line, EDITABLE).queuePlace).toBe(2);
    expect(rowEdits(line[0], line, EDITABLE)).toMatchObject({
      queuePlace: 3,
      moveLater: false,
    });
  });

  it('keeps the control drawn for the only person left in line', () => {
    // This is the reported bug. One asked, one waiting, and the control simply
    // was not rendered - so it read as broken rather than as nothing to do.
    const line = [invite('a', 'sent', 0), invite('b', 'queued', 1)];
    const only = rowEdits(line[1], line, EDITABLE);
    expect(only.reorderable).toBe(true);
    expect(only.moveEarlier).toBe(false);
    expect(only.moveLater).toBe(false);
    expect(lineOrderNotice(line, EDITABLE)).toContain('nobody to swap them with');
  });

  it('says nothing extra once the buttons can speak for themselves', () => {
    const line = [
      invite('a', 'sent', 0),
      invite('b', 'queued', 1),
      invite('c', 'queued', 2),
    ];
    expect(lineOrderNotice(line, EDITABLE)).toBeNull();
  });

  it('explains an empty line instead of leaving a bare list', () => {
    const line = [invite('a', 'sent', 0), invite('b', 'declined', 1)];
    expect(lineOrderNotice(line, EDITABLE)).toContain('Nobody is waiting in line');
  });
});

describe('modes without a line to reorder', () => {
  it('knows which plans go out in waves', () => {
    expect(lineHasWaves('group')).toBe(true);
    expect(lineHasWaves('individual')).toBe(false);
    expect(lineHasWaves('all_at_once')).toBe(false);
  });

  it('has an order only when people are asked one at a time', () => {
    expect(lineHasOrder('individual')).toBe(true);
    expect(lineHasOrder('group')).toBe(false);
    expect(lineHasOrder('all_at_once')).toBe(false);
    // A mode this build has never heard of is not given an order it cannot keep.
    expect(lineHasOrder('carrier_pigeon')).toBe(false);
  });

  it('offers a wave change instead of a reorder in a wave plan', () => {
    // A wave plan has no one-by-one line: its order is which wave goes when, so
    // that is the control it gets. Nothing about it used to be editable once the
    // invitations were in motion, which is the other half of the report.
    const line = [invite('a', 'queued', 0), invite('b', 'queued', 1)];
    const options = { mode: 'group', editable: true };
    expect(rowEdits(line[0], line, options)).toMatchObject({
      reorderable: false,
      queuePlace: null,
      restage: true,
      window: true,
      remove: true,
    });
    expect(lineOrderNotice(line, options)).toContain('which wave');
  });

  it('never offers a wave change where there are no waves', () => {
    const line = [invite('a', 'sent', 0), invite('b', 'queued', 1)];
    for (const mode of ['individual', 'all_at_once', 'carrier_pigeon']) {
      expect(rowEdits(line[1], line, { mode, editable: true }).restage, mode).toBe(
        false,
      );
    }
  });

  it('only lets a queued invite change wave', () => {
    const line = [
      invite('a', 'sent', 0),
      invite('b', 'accepted', 1),
      invite('c', 'queued', 2),
    ];
    const options = { mode: 'group', editable: true };
    expect(rowEdits(line[0], line, options).restage).toBe(false);
    expect(rowEdits(line[1], line, options).restage).toBe(false);
    expect(rowEdits(line[2], line, options).restage).toBe(true);
  });

  it('offers no reorder when everyone was asked at once, and says so', () => {
    const line = [invite('a', 'sent', 0), invite('b', 'queued', 1)];
    const options = { mode: 'all_at_once', editable: true };
    expect(rowEdits(line[1], line, options).reorderable).toBe(false);
    expect(lineOrderNotice(line, options)).toContain('no order to change');
  });
});

describe('the waves a host may move somebody into', () => {
  it('offers every wave the plan has, plus one to push somebody back', () => {
    const line = [
      invite('a', 'queued', 0, 0),
      invite('b', 'queued', 1, 1),
      invite('c', 'queued', 2, 1),
    ];
    expect(wavesOffered(line)).toEqual([0, 1, 2]);
  });

  it('offers a second wave to a plan that only has one', () => {
    expect(wavesOffered([invite('a', 'queued', 0, 0)])).toEqual([0, 1]);
  });

  it('stops at the cap rather than growing forever', () => {
    const line = [invite('a', 'queued', 0, MAX_WAVES - 1)];
    // Five waves exist, so there is no sixth to offer. The SQL function refuses
    // the same value, so the select can never offer a wave the plan would reject.
    expect(wavesOffered(line)).toEqual([0, 1, 2, 3, 4]);
    expect(wavesOffered(line).length).toBe(MAX_WAVES);
  });

  it('reads a missing wave as the first one', () => {
    // `groupStage` is optional on LineInvite: an individual-mode caller does not
    // have to invent one.
    expect(wavesOffered([{ id: 'a', status: 'queued', position: 0 }])).toEqual([
      0, 1,
    ]);
  });
});

describe('a read-only flow', () => {
  const line = [
    invite('a', 'sent', 0),
    invite('b', 'queued', 1),
    invite('c', 'queued', 2),
  ];
  const readOnly = { mode: 'individual', editable: false };

  it('offers no control at all', () => {
    for (const row of line) {
      const edits = rowEdits(row, line, readOnly);
      expect(hasRowControls(edits)).toBe(false);
    }
  });

  it('still shows where people stand, and adds no notice about controls', () => {
    // The place in line is information, not an edit; a settled plan may show it.
    expect(rowEdits(line[1], line, readOnly).queuePlace).toBe(1);
    expect(lineOrderNotice(line, readOnly)).toBeNull();
  });
});

describe('the per-row controls', () => {
  const line = [
    invite('a', 'sent', 0),
    invite('b', 'queued', 1),
    invite('c', 'accepted', 2),
    invite('d', 'declined', 3),
    invite('e', 'expired', 4),
    invite('f', 'cancelled', 5),
  ];

  it('re-times only the invites that have not gone out', () => {
    expect(rowEdits(line[1], line, EDITABLE).window).toBe(true);
    for (const row of [line[0], line[2], line[3]]) {
      expect(rowEdits(row, line, EDITABLE).window, row.status).toBe(false);
    }
  });

  it('offers a resend exactly to the lapsed', () => {
    for (const row of [line[3], line[4], line[5]]) {
      expect(rowEdits(row, line, EDITABLE).resend, row.status).toBe(true);
    }
    for (const row of [line[0], line[1], line[2]]) {
      expect(rowEdits(row, line, EDITABLE).resend, row.status).toBe(false);
    }
  });

  it('never offers to remove someone who accepted', () => {
    // They are coming; taking them out silently is a different act, and the
    // plan's own controls (cancel, capacity) are where that belongs.
    expect(rowEdits(line[2], line, EDITABLE).remove).toBe(false);
    expect(rowEdits(line[0], line, EDITABLE).remove).toBe(true);
  });

  it('draws the strip whenever there is one thing on it', () => {
    expect(hasRowControls(rowEdits(line[2], line, EDITABLE))).toBe(false);
    expect(hasRowControls(rowEdits(line[1], line, EDITABLE))).toBe(true);
  });
});

describe('the hint above the flow', () => {
  it('promises reordering only where reordering exists', () => {
    const live = { editable: true, deciding: false };
    expect(invitationFlowHint('individual', live)).toContain('reorder');
    expect(invitationFlowHint('group', live)).not.toContain('reorder');
    expect(invitationFlowHint('all_at_once', live)).not.toContain('reorder');
  });

  it('points a wave plan at the control it actually has', () => {
    expect(
      invitationFlowHint('group', { editable: true, deciding: false }),
    ).toContain('wave');
  });

  it('tells a plan still picking its date what happens next', () => {
    const deciding = { editable: true, deciding: true };
    expect(invitationFlowHint('individual', deciding)).toContain('set the order now');
    // Waves are an order too, and nothing has gone out yet either.
    expect(invitationFlowHint('group', deciding)).toContain('set the order now');
    expect(invitationFlowHint('all_at_once', deciding)).toContain(
      'once the group has decided',
    );
  });

  it('never claims an edit a read-only view cannot make', () => {
    const settled = { editable: false, deciding: false };
    for (const mode of ['individual', 'group', 'all_at_once']) {
      const hint = invitationFlowHint(mode, settled);
      expect(hint, mode).not.toMatch(/reorder|re-time|take out/);
    }
  });

  it('always says the view is private, in every mode and state', () => {
    for (const mode of ['individual', 'group', 'all_at_once']) {
      for (const editable of [true, false]) {
        for (const deciding of [true, false]) {
          expect(
            invitationFlowHint(mode, { editable, deciding }),
            `${mode} ${editable} ${deciding}`,
          ).toMatch(/^Only you see this - /);
        }
      }
    }
  });
});
