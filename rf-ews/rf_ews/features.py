"""Per-track feature extraction — the discriminators between UAS links and clutter."""

import numpy as np

FEATURE_NAMES = [
    'n_bursts', 'burst_rate_hz', 'mean_burst_dur_ms', 'std_burst_dur_ms',
    'mean_bw_khz', 'freq_spread_khz', 'spread_bw_ratio', 'n_freq_clusters',
    'interval_cv', 'duty_cycle', 'mean_snr_db', 'track_duration_s',
    'chunk_align_frac'
]

CHUNK_S = 0.5  # keep in sync with pipeline.CHUNK_S


def extract(track):
    b = track.bursts
    n = len(b)
    t0s = np.array([x['t0'] for x in b])
    t1s = np.array([x['t1'] for x in b])
    durs = (t1s - t0s) * 1000.0                       # ms
    bws = np.array([x['f_hi'] - x['f_lo'] for x in b]) / 1000.0   # kHz
    centers = np.array([(x['f_hi'] + x['f_lo']) / 2 for x in b]) / 1000.0
    span = max(track.last_t - track.onset, 1e-3)

    # Inter-burst interval regularity (CV): periodic links → low CV
    if n >= 3:
        iv = np.diff(np.sort(t0s))
        iv = iv[iv > 1e-4]
        interval_cv = float(np.std(iv) / (np.mean(iv) + 1e-9)) if iv.size >= 2 else 1.0
    else:
        interval_cv = 1.0

    # Frequency clustering: hoppers use many distinct channels
    order = np.sort(centers)
    if n >= 2:
        gaps = np.diff(order)
        n_clusters = 1 + int(np.sum(gaps > max(np.mean(bws), 1.0) * 1.5))
    else:
        n_clusters = 1

    mean_bw = float(np.mean(bws))
    spread = float(order[-1] - order[0]) if n >= 2 else 0.0

    # Chunk-cadence artifact detector: a weak *continuous* emission gets
    # re-detected once per processing chunk, so its "bursts" all start at
    # chunk boundaries. Real burst trains start at arbitrary offsets.
    phase = np.mod(t0s, CHUNK_S)
    aligned = np.mean((phase < 0.03) | (phase > CHUNK_S - 0.03)) if n else 0.0

    feats = {
        'n_bursts': float(n),
        'burst_rate_hz': n / span,
        'mean_burst_dur_ms': float(np.mean(durs)),
        'std_burst_dur_ms': float(np.std(durs)),
        'mean_bw_khz': mean_bw,
        'freq_spread_khz': spread,
        'spread_bw_ratio': spread / (mean_bw + 1e-9),
        'n_freq_clusters': float(n_clusters),
        'interval_cv': interval_cv,
        'duty_cycle': float(np.clip(np.sum(durs) / 1000.0 / span, 0, 1)),
        'mean_snr_db': float(np.mean([x['snr_db'] for x in b])),
        'track_duration_s': span,
        'chunk_align_frac': float(aligned)
    }
    return feats


def vector(feats):
    return np.array([feats[k] for k in FEATURE_NAMES], dtype=np.float64)
