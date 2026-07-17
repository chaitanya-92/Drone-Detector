"""STFT front end and adaptive noise floor."""

import numpy as np
from scipy.signal import stft
from scipy.ndimage import label as cc_label, find_objects


NPERSEG = 1024
NOVERLAP = 512


def chunk_spectrogram(iq, fs):
    """Full-band (two-sided, fftshifted) dB spectrogram of one chunk.
    Returns (freqs [Hz, -fs/2..fs/2], times [s, chunk-relative], S_db [freq x time])."""
    f, t, Z = stft(iq, fs=fs, nperseg=NPERSEG, noverlap=NOVERLAP,
                   return_onesided=False, boundary=None, padded=False)
    S = np.abs(Z) ** 2
    order = np.argsort(np.fft.fftshift(f))
    f = np.fft.fftshift(f)
    S = np.fft.fftshift(S, axes=0)
    S_db = 10 * np.log10(S + 1e-12)
    return f, t, S_db


class NoiseFloor:
    """Per-bin adaptive noise floor: EMA of chunk-wise low quantile,
    with a clamp on how fast it may rise so persistent signals don't
    get absorbed into the floor."""

    def __init__(self, alpha=0.25, rise_clamp_db=0.8):
        self.alpha = alpha
        self.rise_clamp = rise_clamp_db
        self.floor = None

    def update(self, S_db):
        q = np.median(S_db, axis=1)
        if self.floor is None:
            self.floor = q
        else:
            target = (1 - self.alpha) * self.floor + self.alpha * q
            self.floor = np.minimum(target, self.floor + self.rise_clamp)
        return self.floor


def detect_bursts(S_db, floor_db, freqs, times, t_offset, thresh_db=12.0, min_pixels=60):
    """CFAR-style detection: threshold above floor, connected components → bursts.
    Efficient: bounding boxes via find_objects, component sizes via bincount
    (never rescans the full array per component)."""
    excess = S_db - floor_db[:, None]
    mask = excess > thresh_db
    labeled, n = cc_label(mask)
    if n == 0:
        return []
    sizes = np.bincount(labeled.ravel())
    slices = find_objects(labeled)
    bursts = []
    for k in range(1, n + 1):
        if sizes[k] < min_pixels:
            continue
        sl = slices[k - 1]
        sub = labeled[sl] == k
        snr = float(np.mean(excess[sl][sub]))
        y0, y1 = sl[0].start, sl[0].stop - 1
        x0, x1 = sl[1].start, sl[1].stop - 1
        bursts.append({
            't0': t_offset + float(times[x0]),
            't1': t_offset + float(times[x1]),
            'f_lo': float(freqs[y0]),
            'f_hi': float(freqs[y1]),
            'snr_db': snr,
            'pixels': int(sizes[k])
        })
    return bursts
