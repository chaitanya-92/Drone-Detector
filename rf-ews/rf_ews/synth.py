"""Synthetic RF scene generator.

Produces complex-baseband IQ containing UAS-like emitters (FHSS control links,
OFDM-like video downlinks, periodic telemetry beacons) mixed with clutter
(WiFi-like bursts, BLE-like adverts, CW tones, impulsive noise) over a noise
floor, plus a ground-truth label file for training/evaluation.
"""

import json
import numpy as np
from scipy.signal import butter, lfilter

from .sigmf_io import write_sigmf

UAS_TYPES = ['fhss_control', 'video_link', 'telemetry_beacon']
CLUTTER_TYPES = ['wifi_burst', 'ble_advert', 'cw_tone', 'impulse_noise']


def _bandlimited_burst(n, bw_frac, rng):
    """Complex bandlimited noise burst with ~raised-cosine time envelope."""
    x = rng.standard_normal(n) + 1j * rng.standard_normal(n)
    b, a = butter(4, min(bw_frac, 0.99))
    x = lfilter(b, a, x)
    ramp = max(4, n // 10)
    env = np.ones(n)
    env[:ramp] = np.linspace(0, 1, ramp)
    env[-ramp:] = np.linspace(1, 0, ramp)
    x = x * env
    p = np.mean(np.abs(x) ** 2)
    return x / np.sqrt(p + 1e-12)


def _place(iq, fs, t0, burst, f_off, amp):
    i0 = int(t0 * fs)
    n = burst.size
    if i0 >= iq.size:
        return
    n = min(n, iq.size - i0)
    t = np.arange(n) / fs
    iq[i0:i0 + n] += amp * burst[:n] * np.exp(2j * np.pi * f_off * t)


class SceneGenerator:
    def __init__(self, fs=1_000_000, duration=30.0, seed=0):
        self.fs = fs
        self.duration = duration
        self.rng = np.random.default_rng(seed)
        self.iq = np.zeros(int(fs * duration), dtype=np.complex128)
        self.labels = []

    # ---------------- UAS emitters ----------------

    def add_fhss_control(self, t0, dur, snr_db):
        """Frequency-hopping control link: short periodic bursts hopping over a channel set."""
        rng = self.rng
        fs = self.fs
        bw = rng.uniform(0.05, 0.10) * fs
        hop_period = rng.uniform(0.006, 0.014)          # 6-14 ms — typical RC cadence
        dwell = hop_period * rng.uniform(0.45, 0.75)
        span = rng.uniform(0.5, 0.8) * fs
        n_ch = rng.integers(20, 50)
        channels = (rng.permutation(n_ch) / n_ch - 0.5) * span
        amp = 10 ** (snr_db / 20)
        t = t0
        i = 0
        while t < t0 + dur:
            f = channels[i % len(channels)]
            burst = _bandlimited_burst(int(dwell * fs), bw / fs, rng)
            _place(self.iq, fs, t, burst, f, amp)
            t += hop_period * rng.uniform(0.98, 1.02)
            i += 1
        self._label(t0, dur, -span / 2, span / 2, 'uas', 'fhss_control', snr_db)

    def add_video_link(self, t0, dur, snr_db):
        """OFDM-like video downlink: wide, flat, near-continuous with frame flicker."""
        rng = self.rng
        fs = self.fs
        bw = rng.uniform(0.30, 0.42) * fs
        f = rng.uniform(-0.25, 0.25) * fs
        amp = 10 ** (snr_db / 20)
        n = int(dur * fs)
        x = _bandlimited_burst(n, bw / fs, rng)
        frame_hz = rng.uniform(60, 120)
        tt = np.arange(n) / fs
        flicker = 0.85 + 0.15 * (np.sin(2 * np.pi * frame_hz * tt) > -0.6)
        _place(self.iq, fs, t0, x * flicker, f, amp)
        self._label(t0, dur, f - bw / 2, f + bw / 2, 'uas', 'video_link', snr_db)

    def add_telemetry_beacon(self, t0, dur, snr_db):
        """Narrow periodic telemetry bursts at a fixed frequency."""
        rng = self.rng
        fs = self.fs
        bw = rng.uniform(0.015, 0.03) * fs
        f = rng.uniform(-0.4, 0.4) * fs
        period = rng.uniform(0.1, 0.4)
        blen = rng.uniform(0.008, 0.02)
        amp = 10 ** (snr_db / 20)
        t = t0
        while t < t0 + dur:
            burst = _bandlimited_burst(int(blen * fs), bw / fs, rng)
            _place(self.iq, fs, t, burst, f, amp)
            t += period * rng.uniform(0.99, 1.01)
        self._label(t0, dur, f - bw / 2, f + bw / 2, 'uas', 'telemetry_beacon', snr_db)

    # ---------------- Clutter ----------------

    def add_wifi_burst_cluster(self, t0, dur, snr_db):
        """WiFi-like traffic: wide aperiodic packets in clusters."""
        rng = self.rng
        fs = self.fs
        bw = rng.uniform(0.25, 0.35) * fs
        f = rng.uniform(-0.3, 0.3) * fs
        amp = 10 ** (snr_db / 20)
        t = t0
        while t < t0 + dur:
            blen = rng.uniform(0.0003, 0.003)
            burst = _bandlimited_burst(max(8, int(blen * fs)), bw / fs, rng)
            _place(self.iq, fs, t, burst, f, amp)
            t += blen + rng.exponential(0.02)
        self._label(t0, dur, f - bw / 2, f + bw / 2, 'clutter', 'wifi_burst', snr_db)

    def add_ble_adverts(self, t0, dur, snr_db):
        """BLE-like short adverts on three fixed channels, aperiodic."""
        rng = self.rng
        fs = self.fs
        bw = 0.025 * fs
        chans = rng.uniform(-0.45, 0.45, 3) * fs
        amp = 10 ** (snr_db / 20)
        t = t0
        while t < t0 + dur:
            f = chans[rng.integers(0, 3)]
            burst = _bandlimited_burst(int(0.0005 * fs), bw / fs, rng)
            _place(self.iq, fs, t, burst, f, amp)
            t += rng.exponential(0.05)
        self._label(t0, dur, chans.min() - bw, chans.max() + bw, 'clutter', 'ble_advert', snr_db)

    def add_cw_tone(self, t0, dur, snr_db):
        fs = self.fs
        f = self.rng.uniform(-0.45, 0.45) * fs
        amp = 10 ** (snr_db / 20)
        n = int(dur * fs)
        tt = np.arange(n) / fs
        _place(self.iq, fs, t0, np.exp(0j * tt) * np.ones(n), f, amp)
        self._label(t0, dur, f - 0.002 * fs, f + 0.002 * fs, 'clutter', 'cw_tone', snr_db)

    def add_impulse_noise(self, t0, dur, snr_db):
        rng = self.rng
        fs = self.fs
        amp = 10 ** (snr_db / 20)
        t = t0
        while t < t0 + dur:
            n = int(rng.uniform(0.00005, 0.0002) * fs)
            burst = (rng.standard_normal(max(4, n)) + 1j * rng.standard_normal(max(4, n)))
            _place(self.iq, fs, t, burst / np.sqrt(2), 0, amp)
            t += rng.exponential(0.3)
        self._label(t0, dur, -fs / 2, fs / 2, 'clutter', 'impulse_noise', snr_db)

    # ---------------- Scene assembly ----------------

    def _label(self, t0, dur, f_lo, f_hi, cls, subtype, snr_db):
        self.labels.append({
            't_start': round(t0, 4), 't_end': round(t0 + dur, 4),
            'f_lo': round(f_lo, 1), 'f_hi': round(f_hi, 1),
            'class': cls, 'subtype': subtype, 'snr_db': round(snr_db, 1)
        })

    def populate(self, n_uas=6, n_clutter=10, snr_range=(10, 25), max_concurrent=3):
        """Schedule events on `max_concurrent` lanes so the scene stays
        realistically sparse (a few concurrent emitters, not a wall of signal)."""
        rng = self.rng
        uas_fns = [self.add_fhss_control, self.add_video_link, self.add_telemetry_beacon]
        clutter_fns = [self.add_wifi_burst_cluster, self.add_ble_adverts,
                       self.add_cw_tone, self.add_impulse_noise]
        jobs = ([('uas', uas_fns[i % 3]) for i in range(n_uas)]
                + [('clutter', clutter_fns[i % 4]) for i in range(n_clutter)])
        rng.shuffle(jobs)
        lanes = [0.3] * max_concurrent
        for kind, fn in jobs:
            lane = int(np.argmin(lanes))
            t0 = lanes[lane] + rng.uniform(0.1, 0.6)
            dur = rng.uniform(2.0, 4.5)
            if t0 + dur > self.duration - 0.3:
                continue  # doesn't fit — skip rather than pile up
            fn(t0, dur, rng.uniform(*snr_range))
            lanes[lane] = t0 + dur

    def finalize(self, noise_power_db=0.0):
        """Add unit noise floor and normalize."""
        n = self.iq.size
        noise = (self.rng.standard_normal(n) + 1j * self.rng.standard_normal(n)) / np.sqrt(2)
        self.iq += noise * 10 ** (noise_power_db / 20)
        peak = np.max(np.abs(self.iq))
        return (self.iq / (peak + 1e-12) * 0.8).astype(np.complex64)


def generate_scene(out_base, fs=1_000_000, duration=30.0, seed=0,
                   n_uas=6, n_clutter=10, snr_range=(10, 25)):
    gen = SceneGenerator(fs=fs, duration=duration, seed=seed)
    gen.populate(n_uas=n_uas, n_clutter=n_clutter, snr_range=snr_range)
    iq = gen.finalize()
    write_sigmf(out_base, iq, fs, description=f'rf-ews synthetic scene seed={seed}')
    labels_path = out_base + '_labels.json'
    with open(labels_path, 'w') as f:
        json.dump({'fs': fs, 'duration': duration, 'events': gen.labels}, f, indent=2)
    return out_base + '.sigmf-meta', labels_path
