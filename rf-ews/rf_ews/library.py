"""Signature library: enroll UAS-like signatures, match re-occurrences by cosine similarity."""

import json
import os
import numpy as np

from .features import vector


def _normalize(v):
    # Log-compress heavy-tailed features, then unit norm
    v = np.sign(v) * np.log1p(np.abs(v))
    n = np.linalg.norm(v)
    return v / (n + 1e-12)


class SignatureLibrary:
    def __init__(self, path):
        self.path = path
        self.entries = []
        if path and os.path.exists(path):
            with open(path) as f:
                self.entries = json.load(f).get('signatures', [])

    def match(self, feats, min_similarity=0.92):
        v = _normalize(vector(feats))
        best, best_sim = None, 0.0
        for e in self.entries:
            sim = float(np.dot(v, np.array(e['vector'])))
            if sim > best_sim:
                best, best_sim = e, sim
        if best and best_sim >= min_similarity:
            return best, best_sim
        return None, best_sim

    def enroll(self, feats, alert):
        matched, sim = self.match(feats)
        if matched:
            matched['seen_count'] += 1
            matched['last_seen'] = alert['t_onset']
            matched['alerts'].append(alert['alert_id'])
            return matched['id'], sim, False
        sig_id = f'sig-{len(self.entries) + 1:03d}'
        self.entries.append({
            'id': sig_id,
            'vector': [round(float(x), 6) for x in _normalize(vector(feats))],
            'features': {k: round(float(v), 4) for k, v in feats.items()},
            'first_seen': alert['t_onset'],
            'last_seen': alert['t_onset'],
            'seen_count': 1,
            'alerts': [alert['alert_id']]
        })
        return sig_id, 1.0, True

    def save(self):
        if not self.path:
            return
        with open(self.path, 'w') as f:
            json.dump({'signatures': self.entries}, f, indent=2)
