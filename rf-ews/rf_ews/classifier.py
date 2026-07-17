"""Track classifier: gradient-boosted trees over engineered features,
with a ternary decision (UAS-like / Non-UAS / Unknown) from calibrated confidence."""

import json
import pickle
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_predict

from .features import FEATURE_NAMES, vector


class TrackClassifier:
    def __init__(self, t_uas=0.80, t_non=0.35):
        self.model = GradientBoostingClassifier(
            n_estimators=200, max_depth=3, learning_rate=0.08, random_state=0
        )
        self.t_uas = t_uas
        self.t_non = t_non

    def train(self, feats_list, labels):
        """labels: 1 = uas, 0 = clutter."""
        X = np.vstack([vector(f) for f in feats_list])
        y = np.asarray(labels)
        self.model.fit(X, y)
        # Cross-validated report for honesty
        try:
            proba = cross_val_predict(self.model, X, y, cv=4, method='predict_proba')[:, 1]
            pred = (proba >= 0.5).astype(int)
            tp = int(np.sum((pred == 1) & (y == 1)))
            fp = int(np.sum((pred == 1) & (y == 0)))
            fn = int(np.sum((pred == 0) & (y == 1)))
            prec = tp / (tp + fp + 1e-9)
            rec = tp / (tp + fn + 1e-9)
            f1 = 2 * prec * rec / (prec + rec + 1e-9)
            report = {'cv_precision': round(prec, 3), 'cv_recall': round(rec, 3),
                      'cv_f1': round(f1, 3), 'n_train': int(y.size),
                      'n_uas': int(y.sum()), 'n_clutter': int((1 - y).sum())}
        except Exception:
            report = {'n_train': int(y.size)}
        return report

    def predict(self, feats):
        """Returns (verdict, confidence). Confidence is P(uas)."""
        X = vector(feats).reshape(1, -1)
        p = float(self.model.predict_proba(X)[0, 1])
        if p >= self.t_uas:
            verdict = 'UAS-like'
        elif p <= self.t_non:
            verdict = 'Non-UAS'
        else:
            verdict = 'Unknown'
        return verdict, p

    def save(self, path):
        with open(path, 'wb') as f:
            pickle.dump({'model': self.model, 't_uas': self.t_uas,
                         't_non': self.t_non, 'features': FEATURE_NAMES}, f)

    @classmethod
    def load(cls, path, t_uas=None, t_non=None):
        with open(path, 'rb') as f:
            blob = pickle.load(f)
        clf = cls(t_uas=t_uas if t_uas is not None else blob['t_uas'],
                  t_non=t_non if t_non is not None else blob['t_non'])
        clf.model = blob['model']
        return clf


def auto_label_tracks(tracks_feats, truth_events, min_score=0.15):
    """Competitively match tracks to ground-truth events.

    Score per event = (fraction of track bursts inside the event box)
                    × (freq-span similarity between track and event box).
    The span factor stops narrow clutter sitting inside a hopper's broad
    label box from being mislabeled as UAS. Returns 1 (uas), 0 (clutter)
    or None (ambiguous — drop from training)."""
    labels = []
    for track, feats in tracks_feats:
        f_lo, f_hi = track.freq_range()
        span = max(f_hi - f_lo, 1e3)
        best_score, best_cls = 0.0, None
        for ev in truth_events:
            box_span = max(ev['f_hi'] - ev['f_lo'], 1e3)
            inside = 0
            for b in track.bursts:
                if (b['t0'] <= ev['t_end'] and b['t1'] >= ev['t_start']
                        and b['f_lo'] <= ev['f_hi'] and b['f_hi'] >= ev['f_lo']):
                    inside += 1
            if not inside:
                continue
            containment = inside / len(track.bursts)
            span_sim = min(span, box_span) / max(span, box_span)
            score = containment * span_sim
            if score > best_score:
                best_score, best_cls = score, (1 if ev['class'] == 'uas' else 0)
        labels.append(best_cls if best_score >= min_score else None)
    return labels
