"""Minimal SigMF reader/writer (cf32_le) plus spectrogram-bundle reader.

No external sigmf dependency so the tool runs fully offline.
"""

import json
import os
import numpy as np


def write_sigmf(path_base, iq, sample_rate, center_freq=2_440_000_000, description=''):
    """Write <base>.sigmf-data (complex64) and <base>.sigmf-meta."""
    iq.astype(np.complex64).tofile(path_base + '.sigmf-data')
    meta = {
        'global': {
            'core:datatype': 'cf32_le',
            'core:sample_rate': float(sample_rate),
            'core:version': '1.0.0',
            'core:description': description
        },
        'captures': [{'core:sample_start': 0, 'core:frequency': float(center_freq)}],
        'annotations': []
    }
    with open(path_base + '.sigmf-meta', 'w') as f:
        json.dump(meta, f, indent=2)


class SigMFReader:
    """Chunked reader for cf32_le SigMF recordings."""

    def __init__(self, meta_path):
        with open(meta_path) as f:
            self.meta = json.load(f)
        g = self.meta['global']
        dt = g.get('core:datatype', 'cf32_le')
        if not dt.startswith('cf32'):
            raise ValueError(f'Unsupported datatype {dt} (only cf32_le supported)')
        self.sample_rate = float(g['core:sample_rate'])
        caps = self.meta.get('captures', [{}])
        self.center_freq = float(caps[0].get('core:frequency', 0.0))
        base = meta_path[: -len('.sigmf-meta')] if meta_path.endswith('.sigmf-meta') else meta_path
        self.data_path = base + '.sigmf-data'
        self.n_samples = os.path.getsize(self.data_path) // 8
        self.duration = self.n_samples / self.sample_rate

    def chunks(self, chunk_seconds=0.5):
        """Yield (t_start_seconds, iq_chunk) as if streaming."""
        n = int(self.sample_rate * chunk_seconds)
        with open(self.data_path, 'rb') as f:
            offset = 0
            while offset < self.n_samples:
                raw = np.fromfile(f, dtype=np.complex64, count=n)
                if raw.size == 0:
                    break
                yield offset / self.sample_rate, raw
                offset += raw.size


class SpectrogramBundleReader:
    """Reads a spectrogram bundle: <name>.npz with keys S_db [freq x time],
    freqs_hz, times_s, and optional meta json alongside."""

    def __init__(self, npz_path):
        data = np.load(npz_path)
        self.S_db = data['S_db']
        self.freqs = data['freqs_hz']
        self.times = data['times_s']
        self.sample_rate = float(abs(self.freqs[-1] - self.freqs[0]))
        self.duration = float(self.times[-1])

    def chunks(self, chunk_seconds=0.5):
        """Yield (t_start, S_db_slice, times_slice) column blocks."""
        t0 = 0.0
        while t0 < self.duration:
            mask = (self.times >= t0) & (self.times < t0 + chunk_seconds)
            if mask.any():
                yield t0, self.S_db[:, mask], self.times[mask]
            t0 += chunk_seconds
