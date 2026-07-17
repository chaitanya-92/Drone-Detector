"""End-to-end streaming pipeline: ingest → STFT → floor → bursts → tracks → classify → alerts."""

import json
import os
import time
import numpy as np

from .sigmf_io import SigMFReader, SpectrogramBundleReader
from .dsp import chunk_spectrogram, NoiseFloor, detect_bursts
from .tracker import BurstTracker, Track
from .features import extract
from .classifier import TrackClassifier
from .library import SignatureLibrary

CHUNK_S = 0.5


def _snapshot(S_db, floor, path):
    """Save a spectrogram evidence PNG (no matplotlib dependency)."""
    try:
        from PIL import Image
        img = S_db - floor[:, None]
        img = np.clip((img / 25.0) * 255, 0, 255).astype(np.uint8)
        Image.fromarray(img[::-1]).resize((min(img.shape[1] * 2, 800), 300)).save(path)
        return True
    except Exception:
        return False


def run_detection(input_path, model_path, out_alerts, report_path=None,
                  library_path=None, snapshots_dir=None,
                  threshold=None, t_non=None, thresh_db=12.0, verbose=True):
    Track._next_id = 1
    clf = TrackClassifier.load(model_path, t_uas=threshold, t_non=t_non)
    lib = SignatureLibrary(library_path)
    floor = NoiseFloor()
    if snapshots_dir:
        os.makedirs(snapshots_dir, exist_ok=True)

    if input_path.endswith('.npz'):
        reader = SpectrogramBundleReader(input_path)
        mode = 'spectrogram'
    else:
        reader = SigMFReader(input_path)
        mode = 'iq'
    tracker = BurstTracker(band_hz=getattr(reader, 'sample_rate', 1_000_000))

    alerts = []
    alert_n = 0
    t_wall0 = time.time()
    last_chunk = {'S': None, 'floor': None, 'f': None, 't_off': 0.0}

    def process_block(t_off, freqs, times, S_db):
        nonlocal alert_n
        fl = floor.update(S_db)
        bursts = detect_bursts(S_db, fl, freqs, times, t_off, thresh_db=thresh_db)
        now = t_off + (times[-1] if len(times) else CHUNK_S)
        proc_t = time.time()
        ready, closed = tracker.update(bursts, now)
        last_chunk.update(S=S_db, floor=fl, f=freqs, t_off=t_off)
        # Re-classify tracks at close: if a track that first looked benign has
        # matured into a UAS-like signature, emit an upgraded alert.
        for trk in closed:
            if trk.emitted and len(trk.bursts) >= 5:
                feats = extract(trk)
                verdict, conf = clf.predict(feats)
                if verdict == 'UAS-like' and getattr(trk, 'last_verdict', None) != 'UAS-like':
                    trk.emitted = False   # allow one upgraded emission
                    ready.append(trk)
        # Refresh long-lived UAS-like tracks every 0.9 s: if another emitter has
        # merged into the track, the refreshed (grown) bounds cover it within
        # the ≤2 s alert-latency budget (0.9 s cadence + 0.5 s chunk ≈ 1.4 s worst case).
        for trk in tracker.active:
            if not trk.emitted:
                continue
            if getattr(trk, 'last_verdict', None) != 'UAS-like':
                # Benign/Unknown verdicts are re-examined every chunk as evidence
                # accrues — a slow low-SNR beacon may only cross the confidence
                # threshold after a few more bursts arrive.
                verdict, _ = clf.predict(extract(trk))
                if verdict == 'UAS-like':
                    trk.emitted = False
                    if trk not in ready:
                        ready.append(trk)
                continue
            if now - getattr(trk, 'last_emit', 0) >= 0.9:
                f_lo, f_hi = trk.freq_range()
                prev_span, prev_n = getattr(trk, 'last_extent', (None, 0))
                b = trk.bursts
                # Bursts arriving after a lull mean a *different* emitter is now
                # feeding this track — its coverage window must be re-announced.
                lull_fed = len(b) >= 2 and (b[-1]['t0'] - b[-2]['t1']) > 0.25
                grew = (prev_span is None
                        or (f_hi - f_lo) > prev_span * 1.10
                        or len(trk.bursts) > prev_n * 1.6
                        or lull_fed)
                if grew:   # only refresh when the track absorbed something new
                    trk.emitted = False
                    if trk not in ready:
                        ready.append(trk)
        for trk in ready:
            trk.emitted = True
            trk.last_emit = now
            _lo, _hi = trk.freq_range()
            trk.last_extent = (_hi - _lo, len(trk.bursts))
            alert_n += 1
            feats = extract(trk)
            verdict, conf = clf.predict(feats)
            trk.last_verdict = verdict
            aid = f'a-{alert_n:06d}'
            f_lo, f_hi = trk.freq_range()
            alert = {
                'alert_id': aid,
                'verdict': verdict,
                'confidence': round(conf, 4),
                't_onset': round(trk.onset, 4),
                't_emitted': round(now, 4),
                'latency_s': round(now - trk.onset, 4),
                'f_center_hz': round((f_lo + f_hi) / 2 + reader_center, 1),
                'bandwidth_hz': round(f_hi - f_lo, 1),
                'n_bursts': len(trk.bursts),
                'features': {k: round(float(v), 4) for k, v in feats.items()},
                'track_id': trk.id
            }
            if verdict == 'UAS-like' and library_path:
                sig_id, sim, new = lib.enroll(feats, alert)
                alert['signature'] = {'id': sig_id, 'similarity': round(sim, 4),
                                      'new_signature': new}
            if snapshots_dir and last_chunk['S'] is not None:
                p = os.path.join(snapshots_dir, f'{aid}.png')
                if _snapshot(last_chunk['S'], last_chunk['floor'], p):
                    alert['evidence'] = p
            alerts.append(alert)
            if verbose:
                tag = {'UAS-like': '⚠', 'Non-UAS': '·', 'Unknown': '?'}[verdict]
                print(f'  {tag} {aid} {verdict:9s} conf={conf:.2f} '
                      f't={trk.onset:7.2f}s f={alert["f_center_hz"] / 1e6:9.3f}MHz '
                      f'bw={alert["bandwidth_hz"] / 1e3:7.1f}kHz lat={alert["latency_s"]:.2f}s')

    reader_center = getattr(reader, 'center_freq', 0.0)
    if verbose:
        print(f'▶ rf-ews detect · {mode} input · {reader.duration:.1f}s recording')

    if mode == 'iq':
        for t_off, iq in reader.chunks(CHUNK_S):
            freqs, times, S_db = chunk_spectrogram(iq, reader.sample_rate)
            process_block(t_off, freqs, times, S_db)
    else:
        for t_off, S_db, times in reader.chunks(CHUNK_S):
            process_block(t_off, reader.freqs, times - t_off, S_db)

    # flush remaining unemitted tracks
    for trk in tracker.flush():
        if not trk.emitted and len(trk.bursts) >= 2:
            process_now = trk.last_t
            trk.emitted = True
            alert_n += 1
            feats = extract(trk)
            verdict, conf = clf.predict(feats)
            f_lo, f_hi = trk.freq_range()
            alerts.append({
                'alert_id': f'a-{alert_n:06d}', 'verdict': verdict,
                'confidence': round(conf, 4), 't_onset': round(trk.onset, 4),
                't_emitted': round(process_now, 4),
                'latency_s': round(process_now - trk.onset, 4),
                'f_center_hz': round((f_lo + f_hi) / 2 + reader_center, 1),
                'bandwidth_hz': round(f_hi - f_lo, 1),
                'n_bursts': len(trk.bursts),
                'features': {k: round(float(v), 4) for k, v in feats.items()},
                'track_id': trk.id
            })

    wall = time.time() - t_wall0
    with open(out_alerts, 'w') as f:
        for a in alerts:
            f.write(json.dumps(a) + '\n')
    lib.save()

    by_verdict = {}
    for a in alerts:
        by_verdict[a['verdict']] = by_verdict.get(a['verdict'], 0) + 1
    lats = [a['latency_s'] for a in alerts]
    summary = {
        'input': os.path.basename(input_path),
        'recording_s': round(reader.duration, 2),
        'processing_s': round(wall, 2),
        'realtime_factor': round(reader.duration / max(wall, 1e-6), 2),
        'alerts_total': len(alerts),
        'by_verdict': by_verdict,
        'latency_mean_s': round(float(np.mean(lats)), 3) if lats else None,
        'latency_p95_s': round(float(np.percentile(lats, 95)), 3) if lats else None,
        'thresholds': {'t_uas': clf.t_uas, 't_non': clf.t_non, 'cfar_db': thresh_db}
    }
    if report_path:
        with open(report_path, 'w') as f:
            json.dump(summary, f, indent=2)
    if verbose:
        print(f'✔ {len(alerts)} alerts → {out_alerts}')
        print(f'  realtime factor: {summary["realtime_factor"]}x · '
              f'latency p95: {summary["latency_p95_s"]}s')
    return alerts, summary


def collect_tracks(input_path, thresh_db=12.0):
    """Run just the detector/tracker over a recording (for training).
    Returns [(track, feats), ...]."""
    Track._next_id = 1
    floor = NoiseFloor()
    reader = SigMFReader(input_path)
    tracker = BurstTracker(band_hz=reader.sample_rate)
    done = []

    for t_off, iq in reader.chunks(CHUNK_S):
        freqs, times, S_db = chunk_spectrogram(iq, reader.sample_rate)
        fl = floor.update(S_db)
        bursts = detect_bursts(S_db, fl, freqs, times, t_off, thresh_db=thresh_db)
        now = t_off + (times[-1] if len(times) else CHUNK_S)
        _, closed = tracker.update(bursts, now)
        done.extend(closed)
    done.extend(tracker.flush())
    return [(t, extract(t)) for t in done if len(t.bursts) >= 2]
