"""Groups per-chunk bursts into emitter tracks (events).

Association rules (per new burst, against each active track):
- Continuity: burst overlaps the track's *most recent* burst in frequency
  → continuous links (video, CW, WiFi channel traffic).
- Hopper: burst bandwidth AND duration are similar to the track's typical
  burst → frequency hoppers whose channels land anywhere in the band.
- Broadband guard: near-full-band bursts (impulses) only join broadband tracks.

Using the last burst (not the accumulated span) for continuity prevents a
hopper's growing footprint from swallowing every other emitter in the band.
"""

import numpy as np

MAX_GAP_S = 0.45          # close a track after this much silence
HOP_GAP_S = 0.035         # hopper rule: hops arrive fast (real hoppers dwell ms)
HOP_DUR_S = 0.03          # hopper rule: only ms-scale packets hop
BW_RATIO_MAX = 2.0        # hopper rule: bandwidth similarity
DUR_RATIO_MAX = 2.5       # hopper rule: burst-duration similarity
BROADBAND_FRAC = 0.5      # bursts wider than this fraction of band = impulse-like


def _ratio(a, b):
    a, b = abs(a) + 1e-9, abs(b) + 1e-9
    return max(a, b) / min(a, b)


class Track:
    _next_id = 1

    def __init__(self, burst):
        self.id = f'trk-{Track._next_id:04d}'
        Track._next_id += 1
        self.bursts = [burst]
        self.onset = burst['t0']
        self.last_t = burst['t1']
        self.emitted = False

    def freq_range(self):
        return (min(b['f_lo'] for b in self.bursts),
                max(b['f_hi'] for b in self.bursts))

    def mean_bw(self):
        return float(np.mean([b['f_hi'] - b['f_lo'] for b in self.bursts]))

    def mean_dur(self):
        return float(np.mean([b['t1'] - b['t0'] for b in self.bursts]))

    def try_add(self, burst, band_hz):
        if burst['t0'] - self.last_t > MAX_GAP_S:
            return False
        bw = burst['f_hi'] - burst['f_lo']
        dur = burst['t1'] - burst['t0']
        track_broadband = self.mean_bw() > BROADBAND_FRAC * band_hz
        burst_broadband = bw > BROADBAND_FRAC * band_hz
        if burst_broadband != track_broadband:
            return False

        last = self.bursts[-1]
        # Continuity also demands similar bandwidth — a narrow beacon must not
        # be swallowed by a wide clutter track just because their bands overlap.
        overlaps_last = (burst['f_hi'] >= last['f_lo'] and burst['f_lo'] <= last['f_hi']
                         and _ratio(bw, self.mean_bw()) <= 3.5)
        # Hopper rule is deliberately strict: only fast-arriving, ms-scale,
        # same-shape packets may join at a different frequency. This is what
        # keeps concurrent emitters from chaining into one mega-track.
        gap = burst['t0'] - self.last_t
        hopper_like = (dur < HOP_DUR_S
                       and self.mean_dur() < HOP_DUR_S
                       and gap < HOP_GAP_S
                       and _ratio(bw, self.mean_bw()) <= BW_RATIO_MAX
                       and _ratio(dur, self.mean_dur()) <= DUR_RATIO_MAX)

        if overlaps_last or hopper_like:
            self.bursts.append(burst)
            self.last_t = max(self.last_t, burst['t1'])
            return True
        return False


class BurstTracker:
    def __init__(self, band_hz=1_000_000, confirm_bursts=3,
                 confirm_age_s=0.45, force_emit_s=0.9):
        self.band_hz = band_hz
        self.active = []
        self.confirm_bursts = confirm_bursts
        self.confirm_age = confirm_age_s
        self.force_emit = force_emit_s

    def update(self, bursts, now):
        """Feed the chunk's bursts (stream time `now` = chunk end).
        Returns (ready, closed): ready = confirmed, not yet emitted;
        closed = tracks that just ended."""
        for b in sorted(bursts, key=lambda x: x['t0']):
            for trk in self.active:
                if trk.try_add(b, self.band_hz):
                    break
            else:
                self.active.append(Track(b))

        ready, closed, still = [], [], []
        for trk in self.active:
            age = now - trk.onset
            if not trk.emitted and (len(trk.bursts) >= self.confirm_bursts
                                    and age >= self.confirm_age
                                    or age >= self.force_emit):
                ready.append(trk)
            if now - trk.last_t > MAX_GAP_S:
                closed.append(trk)
            else:
                still.append(trk)
        self.active = still
        return ready, closed

    def flush(self):
        out = list(self.active)
        self.active = []
        return out
