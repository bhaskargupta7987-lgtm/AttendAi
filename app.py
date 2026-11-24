"""
AttendAI — Multimodal Attendance & Engagement Agent
100% Offline, Privacy-Preserving Classroom Intelligence System
Built with Streamlit, OpenCV (5.0+ compatible), Librosa, SoundDevice, and Altair.
"""

from __future__ import annotations

import csv
import datetime
import hashlib
import os
import platform
import ssl
import tempfile
import threading
import time
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import altair as alt
import cv2
import numpy as np
import pandas as pd
import streamlit as st

# ---------------------------------------------------------------------------
# Optional Offline Multimodal Dependencies (Graceful Fallbacks)
# ---------------------------------------------------------------------------
try:
    import mediapipe as mp  # type: ignore
except Exception:
    mp = None  # type: ignore

try:
    import librosa  # type: ignore
except Exception:
    librosa = None  # type: ignore

try:
    import sounddevice as sd  # type: ignore
except Exception:
    sd = None  # type: ignore


# ---------------------------------------------------------------------------
# Constants & Paths
# ---------------------------------------------------------------------------
APP_TITLE = "AttendAI — Multimodal Attendance & Engagement Agent"
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
TARGET_FPS = 30

ATTENDANCE_CSV_PATH = Path("attendance_session_logs.csv")
AUDIT_LEDGER_CSV_PATH = Path("attendance_audit_ledger.csv")
CACHE_DIR = Path(".attendai_cache")
HAAR_FILENAME = "haarcascade_frontalface_alt2.xml"
HAAR_URL = (
    "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/"
    "haarcascade_frontalface_alt2.xml"
)

ATTENDANCE_COLUMNS = [
    "Student_ID",
    "Name",
    "Timestamp",
    "Sustained_Sec",
    "Avg_Engagement_Pct",
    "Status",
    "SHA256_Token",
]

AUDIT_COLUMNS = [
    "Ledger_Index",
    "Timestamp",
    "Student_ID",
    "Name",
    "Sustained_Sec",
    "Avg_Engagement_Pct",
    "Prev_Hash",
    "SHA256_Token",
]

DEFAULT_ROSTER = [
    ("STU-101", "Aarav Sharma"),
    ("STU-102", "Diya Patel"),
    ("STU-103", "Rohan Verma"),
    ("STU-104", "Ananya Iyer"),
    ("STU-105", "Kabir Mehta"),
    ("STU-106", "Meera Nair"),
    ("STU-107", "Vikram Rao"),
    ("STU-108", "Ishita Joshi"),
    ("STU-109", "Siddharth Gupta"),
    ("STU-110", "Priya Kulkarni"),
]

GENESIS_HASH = "0" * 64


# ---------------------------------------------------------------------------
# Page Config (Must be first Streamlit call)
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="AttendAI | Classroom Intelligence",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ---------------------------------------------------------------------------
# Theme & CSS Styling (Fixes Tiny Image Dot Bug + High-Contrast Light/Dark)
# ---------------------------------------------------------------------------
def apply_theme_css(dark_mode: bool) -> None:
    """Inject high-contrast CSS for both Dark and Light themes plus image sizing fix."""
    if dark_mode:
        bg_app = "#0B1120"
        bg_sidebar = "#111827"
        bg_card = "#162033"
        bg_elevated = "#1E293B"
        border_col = "#2E3B52"
        text_primary = "#F8FAFC"
        text_secondary = "#CBD5E1"
        text_muted = "#94A3B8"
        accent = "#38BDF8"
        tab_bg = "#162033"
        tab_active_bg = "#0EA5E9"
        tab_active_text = "#FFFFFF"
        table_header_bg = "#1E293B"
    else:
        bg_app = "#F4F7FB"
        bg_sidebar = "#FFFFFF"
        bg_card = "#FFFFFF"
        bg_elevated = "#F1F5F9"
        border_col = "#CBD5E1"
        text_primary = "#0F172A"
        text_secondary = "#334155"
        text_muted = "#475569"
        accent = "#0284C7"
        tab_bg = "#E2E8F0"
        tab_active_bg = "#0284C7"
        tab_active_text = "#FFFFFF"
        table_header_bg = "#F1F5F9"

    st.markdown(
        f"""
        <style>
        /* Core App Background & Typography */
        .stApp {{
            background-color: {bg_app} !important;
            color: {text_primary} !important;
        }}
        section[data-testid="stSidebar"] {{
            background-color: {bg_sidebar} !important;
            border-right: 1px solid {border_col} !important;
        }}
        section[data-testid="stSidebar"] * {{
            color: {text_primary} !important;
        }}
        section[data-testid="stSidebar"] .stSlider label,
        section[data-testid="stSidebar"] .stSelectbox label,
        section[data-testid="stSidebar"] .stRadio label,
        section[data-testid="stSidebar"] .stTextArea label {{
            color: {text_secondary} !important;
            font-weight: 600 !important;
        }}

        /* Fix Streamlit Tiny Image Dot Bug */
        div[data-testid="stImage"] img {{
            min-width: 480px !important;
            max-width: 680px !important;
            width: 100% !important;
            height: auto !important;
            border-radius: 10px !important;
            border: 1px solid {border_col} !important;
            display: block !important;
            object-fit: contain !important;
        }}

        /* Header & Typography Contrast */
        h1, h2, h3, h4, h5, h6, p, span, label, div {{
            color: {text_primary};
        }}
        .attendai-header {{
            background: {bg_card};
            border: 1px solid {border_col};
            border-radius: 12px;
            padding: 14px 20px;
            margin-bottom: 12px;
        }}
        .attendai-title {{
            font-size: 1.5rem;
            font-weight: 800;
            color: {text_primary} !important;
            margin: 0;
            line-height: 1.25;
        }}
        .attendai-subtitle {{
            font-size: 0.88rem;
            color: {text_secondary} !important;
            margin-top: 4px;
        }}
        .attendai-badge {{
            display: inline-block;
            background: {bg_elevated};
            border: 1px solid {border_col};
            color: {accent} !important;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 2px 10px;
            border-radius: 6px;
            margin-top: 6px;
        }}

        /* Metric Cards */
        div[data-testid="stMetric"] {{
            background-color: {bg_card} !important;
            border: 1px solid {border_col} !important;
            border-radius: 10px !important;
            padding: 12px 14px !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }}
        div[data-testid="stMetric"] label,
        div[data-testid="stMetricLabel"] p {{
            color: {text_muted} !important;
            font-weight: 600 !important;
            font-size: 0.82rem !important;
        }}
        div[data-testid="stMetricValue"] div {{
            color: {text_primary} !important;
            font-weight: 800 !important;
            font-size: 1.45rem !important;
        }}
        div[data-testid="stMetricDelta"] div {{
            font-weight: 600 !important;
        }}

        /* Tabs Styling */
        div[data-testid="stTabs"] button[role="tab"] {{
            background-color: {tab_bg} !important;
            color: {text_primary} !important;
            border-radius: 8px 8px 0 0 !important;
            border: 1px solid {border_col} !important;
            padding: 8px 16px !important;
            font-weight: 700 !important;
            margin-right: 4px !important;
        }}
        div[data-testid="stTabs"] button[role="tab"][aria-selected="true"] {{
            background-color: {tab_active_bg} !important;
            color: {tab_active_text} !important;
            border-color: {tab_active_bg} !important;
        }}
        div[data-testid="stTabs"] button[role="tab"][aria-selected="true"] * {{
            color: {tab_active_text} !important;
        }}

        /* Buttons */
        div.stButton > button,
        div.stDownloadButton > button {{
            background-color: {bg_elevated} !important;
            color: {text_primary} !important;
            border: 1px solid {border_col} !important;
            border-radius: 8px !important;
            font-weight: 700 !important;
            transition: all 0.15s ease-in-out;
        }}
        div.stButton > button[kind="primary"] {{
            background-color: {tab_active_bg} !important;
            color: #FFFFFF !important;
            border-color: {tab_active_bg} !important;
        }}
        div.stButton > button[kind="primary"] * {{
            color: #FFFFFF !important;
        }}

        /* Dataframes & Inputs */
        div[data-testid="stDataFrame"] {{
            background-color: {bg_card} !important;
            border: 1px solid {border_col} !important;
            border-radius: 10px !important;
            padding: 4px !important;
        }}
        .stSelectbox div[data-baseweb="select"] > div,
        .stNumberInput input,
        .stTextInput input,
        .stTextArea textarea {{
            background-color: {bg_card} !important;
            color: {text_primary} !important;
            border: 1px solid {border_col} !important;
        }}

        /* Pedagogical & Compliance Banners */
        .suggestion-banner {{
            border-radius: 10px;
            padding: 14px 16px;
            margin-top: 10px;
            border-left: 6px solid;
        }}
        .banner-title {{
            font-size: 0.96rem;
            font-weight: 800;
            margin-bottom: 4px;
        }}
        .banner-body {{
            font-size: 0.88rem;
            line-height: 1.45;
        }}
        .section-card {{
            background-color: {bg_card};
            border: 1px solid {border_col};
            border-radius: 10px;
            padding: 14px 16px;
            margin-bottom: 12px;
        }}
        .table-caption {{
            color: {text_muted} !important;
            font-size: 0.8rem;
            margin-bottom: 6px;
        }}
        /* Expander header */
        details summary {{
            background-color: {table_header_bg} !important;
            color: {text_primary} !important;
            border-radius: 8px !important;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Offline CSV & Cryptographic Audit Ledger Utilities
# ---------------------------------------------------------------------------
def ensure_csv_files_exist() -> None:
    """Create attendance and SHA-256 audit ledger CSVs with headers if missing."""
    if not ATTENDANCE_CSV_PATH.exists():
        pd.DataFrame(columns=ATTENDANCE_COLUMNS).to_csv(
            ATTENDANCE_CSV_PATH, index=False
        )
    if not AUDIT_LEDGER_CSV_PATH.exists():
        pd.DataFrame(columns=AUDIT_COLUMNS).to_csv(
            AUDIT_LEDGER_CSV_PATH, index=False
        )


def read_attendance_csv() -> pd.DataFrame:
    ensure_csv_files_exist()
    try:
        df = pd.read_csv(ATTENDANCE_CSV_PATH)
        for col in ATTENDANCE_COLUMNS:
            if col not in df.columns:
                df[col] = ""
        return df[ATTENDANCE_COLUMNS]
    except Exception:
        return pd.DataFrame(columns=ATTENDANCE_COLUMNS)


def read_audit_ledger_csv() -> pd.DataFrame:
    ensure_csv_files_exist()
    try:
        df = pd.read_csv(AUDIT_LEDGER_CSV_PATH)
        for col in AUDIT_COLUMNS:
            if col not in df.columns:
                df[col] = ""
        return df[AUDIT_COLUMNS]
    except Exception:
        return pd.DataFrame(columns=AUDIT_COLUMNS)


def compute_sha256_token(
    student_id: str,
    name: str,
    timestamp: str,
    sustained_sec: float,
    avg_engagement: float,
    prev_hash: str,
) -> str:
    payload = (
        f"{student_id}|{name}|{timestamp}|{sustained_sec:.2f}|"
        f"{avg_engagement:.2f}|{prev_hash}|AttendAI-Offline-V1"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def append_verified_attendance(
    student_id: str,
    name: str,
    timestamp: str,
    sustained_sec: float,
    avg_engagement: float,
) -> str:
    """Append verified attendance record to both CSV logs with chained SHA-256 hash."""
    ensure_csv_files_exist()
    ledger_df = read_audit_ledger_csv()
    if len(ledger_df) > 0:
        prev_hash = str(ledger_df.iloc[-1]["SHA256_Token"])
        next_idx = int(len(ledger_df)) + 1
    else:
        prev_hash = GENESIS_HASH
        next_idx = 1

    token = compute_sha256_token(
        student_id=student_id,
        name=name,
        timestamp=timestamp,
        sustained_sec=sustained_sec,
        avg_engagement=avg_engagement,
        prev_hash=prev_hash,
    )

    with open(ATTENDANCE_CSV_PATH, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                student_id,
                name,
                timestamp,
                round(sustained_sec, 2),
                round(avg_engagement, 1),
                "PRESENT",
                token,
            ]
        )

    with open(AUDIT_LEDGER_CSV_PATH, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                next_idx,
                timestamp,
                student_id,
                name,
                round(sustained_sec, 2),
                round(avg_engagement, 1),
                prev_hash,
                token,
            ]
        )

    return token


def verify_audit_ledger_integrity(ledger_df: pd.DataFrame) -> Tuple[bool, str]:
    """Verify hash-chain integrity across all rows of attendance_audit_ledger.csv."""
    if ledger_df.empty:
        return True, "Ledger is empty (0 commits). Ready for verification."

    expected_prev = GENESIS_HASH
    for idx, row in ledger_df.iterrows():
        prev_hash = str(row["Prev_Hash"])
        if prev_hash != expected_prev:
            return (
                False,
                f"Chain break detected at Ledger_Index {row['Ledger_Index']} (row {idx + 1}).",
            )
        recomputed = compute_sha256_token(
            student_id=str(row["Student_ID"]),
            name=str(row["Name"]),
            timestamp=str(row["Timestamp"]),
            sustained_sec=float(row["Sustained_Sec"]),
            avg_engagement=float(row["Avg_Engagement_Pct"]),
            prev_hash=prev_hash,
        )
        if recomputed != str(row["SHA256_Token"]):
            return (
                False,
                f"SHA-256 payload mismatch at Ledger_Index {row['Ledger_Index']} (row {idx + 1}).",
            )
        expected_prev = recomputed

    return True, f"Verified {len(ledger_df)} immutable commit(s) with 0 tampering detected."


# ---------------------------------------------------------------------------
# 3-Tier Face Detection Engine (OpenCV 5.0 + macOS Safe)
# ---------------------------------------------------------------------------
@dataclass
class FaceDetection:
    bbox: Tuple[int, int, int, int]  # (x, y, w, h)
    confidence: float
    pose_hint: Optional[str] = None  # Optional keypoint-derived hint from Tier 1


class ThreeTierFaceDetector:
    """
    OpenCV 5.0 & macOS-safe 3-Tier Face Detection Pipeline:
      - Tier 1: MediaPipe Face Detection (if mediapipe & mp.solutions exist)
      - Tier 2: Haar Cascade (ONLY if hasattr(cv2, "CascadeClassifier"))
      - Tier 3: Guaranteed OpenCV 5.0 Core Detector (YCrCb + HSV + solidity + AR + upper-face std)
    """

    def __init__(self, prefer_mode: str = "Auto (3-Tier Fallback)") -> None:
        self.prefer_mode = prefer_mode
        self.active_tier_label = "Tier 3: OpenCV 5.0 YCrCb+HSV Core"
        self.mp_detector = None
        self.haar_classifier = None
        self._init_pipeline()

    def _init_pipeline(self) -> None:
        if self.prefer_mode == "Tier 3 (OpenCV 5.0 Core)":
            self.active_tier_label = "Tier 3: OpenCV 5.0 YCrCb+HSV Core"
            return

        # Tier 1: MediaPipe
        if mp is not None and hasattr(mp, "solutions"):
            try:
                if hasattr(mp.solutions, "face_detection"):
                    self.mp_detector = mp.solutions.face_detection.FaceDetection(
                        model_selection=1,
                        min_detection_confidence=0.55,
                    )
                    self.active_tier_label = "Tier 1: MediaPipe FaceDetection"
                    return
            except Exception:
                self.mp_detector = None

        # Tier 2: Haar Cascade (STRICT guard for OpenCV 5.0)
        if hasattr(cv2, "CascadeClassifier"):
            haar_path = self._resolve_haar_cascade()
            if haar_path is not None:
                try:
                    clf = cv2.CascadeClassifier(str(haar_path))
                    if not clf.empty():
                        self.haar_classifier = clf
                        self.active_tier_label = "Tier 2: Haar Cascade (alt2)"
                        return
                except Exception:
                    self.haar_classifier = None

        # Tier 3: Guaranteed OpenCV 5.0 Core Detector
        self.active_tier_label = "Tier 3: OpenCV 5.0 YCrCb+HSV Core"

    def _resolve_haar_cascade(self) -> Optional[Path]:
        """Locate bundled Haar XML or download using unverified SSL context for macOS."""
        try:
            if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
                bundled = Path(cv2.data.haarcascades) / HAAR_FILENAME
                if bundled.exists():
                    return bundled
        except Exception:
            pass

        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached = CACHE_DIR / HAAR_FILENAME
        if cached.exists() and cached.stat().st_size > 10_000:
            return cached

        try:
            unverified_ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(
                HAAR_URL, timeout=3.0, context=unverified_ctx
            ) as resp:
                data = resp.read()
                if len(data) > 10_000:
                    cached.write_bytes(data)
                    return cached
        except Exception:
            return None
        return None

    def detect(self, frame_bgr: np.ndarray) -> List[FaceDetection]:
        h, w = frame_bgr.shape[:2]

        # Tier 1 execution
        if self.mp_detector is not None:
            try:
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                res = self.mp_detector.process(rgb)
                detections: List[FaceDetection] = []
                if res.detections:
                    for det in res.detections:
                        rel_box = det.location_data.relative_bounding_box
                        bx = max(0, int(rel_box.xmin * w))
                        by = max(0, int(rel_box.ymin * h))
                        bw = min(w - bx, int(rel_box.width * w))
                        bh = min(h - by, int(rel_box.height * h))
                        if bw >= 32 and bh >= 32:
                            pose_hint = self._mediapipe_pose_hint(det)
                            score = float(det.score[0]) if det.score else 0.85
                            detections.append(
                                FaceDetection(
                                    bbox=(bx, by, bw, bh),
                                    confidence=score,
                                    pose_hint=pose_hint,
                                )
                            )
                return self._nms(detections, iou_thresh=0.35)
            except Exception:
                pass

        # Tier 2 execution (only if CascadeClassifier was safely verified)
        if self.haar_classifier is not None:
            try:
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                gray_eq = cv2.equalizeHist(gray)
                rects = self.haar_classifier.detectMultiScale(
                    gray_eq,
                    scaleFactor=1.12,
                    minNeighbors=5,
                    minSize=(40, 40),
                )
                detections = [
                    FaceDetection(bbox=(int(x), int(y), int(bw), int(bh)), confidence=0.82)
                    for (x, y, bw, bh) in rects
                ]
                return self._nms(detections, iou_thresh=0.35)
            except Exception:
                pass

        # Tier 3 execution (Guaranteed OpenCV 5.0 Core)
        return self._detect_tier3_core(frame_bgr)

    @staticmethod
    def _mediapipe_pose_hint(det: Any) -> Optional[str]:
        try:
            kps = det.location_data.relative_keypoints
            if len(kps) >= 6:
                right_eye_x = kps[0].x
                left_eye_x = kps[1].x
                nose_x = kps[2].x
                eye_span = abs(left_eye_x - right_eye_x)
                if eye_span < 1e-4:
                    return "Looking Away"
                mid_eye_x = 0.5 * (right_eye_x + left_eye_x)
                yaw_ratio = abs(nose_x - mid_eye_x) / eye_span
                return "Looking Away" if yaw_ratio > 0.36 else "Focused"
        except Exception:
            return None
        return None

    def _detect_tier3_core(self, frame_bgr: np.ndarray) -> List[FaceDetection]:
        """
        Dual-space YCrCb + HSV skin & cranial contour detector with:
          - Convex-hull solidity > 0.75 (rejects open hands/fingers)
          - Aspect ratio 0.62 - 1.38
          - Vertical position bound y < 0.68 * h (ignores hands on desk)
          - Upper-face grayscale std > 10.0 (ensures eye/brow facial contrast)
        """
        h, w = frame_bgr.shape[:2]
        blurred = cv2.GaussianBlur(frame_bgr, (5, 5), 0)

        ycrcb = cv2.cvtColor(blurred, cv2.COLOR_BGR2YCrCb)
        hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        mask_ycrcb = cv2.inRange(
            ycrcb,
            np.array([25, 133, 77], dtype=np.uint8),
            np.array([255, 173, 127], dtype=np.uint8),
        )
        mask_hsv_low = cv2.inRange(
            hsv,
            np.array([0, 22, 45], dtype=np.uint8),
            np.array([25, 185, 255], dtype=np.uint8),
        )
        mask_hsv_high = cv2.inRange(
            hsv,
            np.array([165, 22, 45], dtype=np.uint8),
            np.array([180, 185, 255], dtype=np.uint8),
        )
        mask_hsv = cv2.bitwise_or(mask_hsv_low, mask_hsv_high)
        combined = cv2.bitwise_and(mask_ycrcb, mask_hsv)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)

        contours, _ = cv2.findContours(
            combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        frame_area = float(w * h)
        candidates: List[FaceDetection] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 1800 or area > 0.42 * frame_area:
                continue

            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw < 38 or bh < 42:
                continue

            # Vertical bound: ignore lower desk/hand regions
            if by >= 0.68 * h:
                continue

            # Aspect ratio filter
            ar = bw / float(bh)
            if ar < 0.62 or ar > 1.38:
                continue

            # Convex-hull solidity filter (> 0.75 rejects fingers/open hands)
            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            if hull_area <= 0:
                continue
            solidity = area / hull_area
            if solidity <= 0.75:
                continue

            # Upper-face grayscale std > 10.0 for eye/brow texture contrast
            upper_h = max(12, int(0.55 * bh))
            upper_roi = gray[by : min(h, by + upper_h), bx : min(w, bx + bw)]
            if upper_roi.size == 0 or float(np.std(upper_roi)) <= 10.0:
                continue

            conf = min(0.95, 0.55 + 0.35 * solidity)
            candidates.append(FaceDetection(bbox=(bx, by, bw, bh), confidence=conf))

        return self._nms(candidates, iou_thresh=0.35)

    @staticmethod
    def _nms(
        detections: List[FaceDetection], iou_thresh: float = 0.35
    ) -> List[FaceDetection]:
        if len(detections) <= 1:
            return detections
        sorted_dets = sorted(detections, key=lambda d: d.confidence, reverse=True)
        kept: List[FaceDetection] = []
        for det in sorted_dets:
            if all(_compute_iou(det.bbox, k.bbox) < iou_thresh for k in kept):
                kept.append(det)
        return kept


def _compute_iou(
    box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]
) -> float:
    ax1, ay1, aw, ah = box_a
    bx1, by1, bw, bh = box_b
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    union = aw * ah + bw * bh - inter
    return inter / float(union) if union > 0 else 0.0


# ---------------------------------------------------------------------------
# Offline Audio Analyzer (Librosa + SoundDevice with Safe Fallback)
# ---------------------------------------------------------------------------
class OfflineAudioMonitor:
    """
    Thread-safe offline audio analyzer using sounddevice + librosa.
    Computes RMS energy and Zero-Crossing Rate (ZCR) over a rolling 0.5s buffer.
    Falls back cleanly if no microphone or audio library is available.
    """

    def __init__(self, sample_rate: int = 16000, window_sec: float = 0.6) -> None:
        self.sample_rate = sample_rate
        self.max_samples = int(sample_rate * window_sec)
        self._buffer: deque[float] = deque(maxlen=self.max_samples)
        self._lock = threading.Lock()
        self._stream: Any = None
        self.running = False
        self.mic_available = False
        self.status_note = "Standby"
        self.last_state = "Silence / Passive"
        self.last_score = 65.0
        self.last_rms = 0.0
        self.last_zcr = 0.0

    def start(self) -> None:
        if self.running:
            return
        if sd is None:
            self.mic_available = False
            self.status_note = "sounddevice unavailable (Fallback)"
            return
        try:
            def _callback(indata: np.ndarray, frames: int, time_info: Any, status: Any) -> None:
                if frames > 0:
                    mono = indata[:, 0].astype(np.float32)
                    with self._lock:
                        self._buffer.extend(mono.tolist())

            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                blocksize=1024,
                callback=_callback,
            )
            self._stream.start()
            self.running = True
            self.mic_available = True
            self.status_note = "Live Mic Active"
        except Exception as exc:
            self._stream = None
            self.running = False
            self.mic_available = False
            self.status_note = f"Mic Fallback ({type(exc).__name__})"

    def stop(self) -> None:
        self.running = False
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

    def analyze(self, mode: str = "Live Microphone") -> Tuple[str, float, float, float]:
        """
        Returns (audio_state, audio_score, rms_val, zcr_val).
        States:
          - Silence / Passive: 65 pts
          - Active Speech / Q&A: 100 pts
          - High Noise / Disturbance: 35 pts
        """
        if mode == "Muted Fallback (65 pts)":
            self.last_state = "Silence / Passive"
            self.last_score = 65.0
            self.last_rms = 0.004
            self.last_zcr = 0.02
            self.status_note = "Muted Fallback"
            return self.last_state, self.last_score, self.last_rms, self.last_zcr

        if mode == "Simulated Q&A Cycle":
            phase = int(time.time() // 8) % 3
            if phase == 0:
                self.last_state, self.last_score, self.last_rms, self.last_zcr = (
                    "Active Speech / Q&A",
                    100.0,
                    0.042,
                    0.085,
                )
            elif phase == 1:
                self.last_state, self.last_score, self.last_rms, self.last_zcr = (
                    "Silence / Passive",
                    65.0,
                    0.006,
                    0.025,
                )
            else:
                self.last_state, self.last_score, self.last_rms, self.last_zcr = (
                    "High Noise / Disturbance",
                    35.0,
                    0.165,
                    0.240,
                )
            self.status_note = "Simulated Audio"
            return self.last_state, self.last_score, self.last_rms, self.last_zcr

        # Live Microphone mode
        if not self.mic_available:
            self.last_state = "Silence / Passive"
            self.last_score = 65.0
            self.last_rms = 0.0
            self.last_zcr = 0.0
            return self.last_state, self.last_score, self.last_rms, self.last_zcr

        with self._lock:
            if len(self._buffer) < 512:
                return self.last_state, self.last_score, self.last_rms, self.last_zcr
            samples = np.array(self._buffer, dtype=np.float32)

        if librosa is not None:
            try:
                rms_arr = librosa.feature.rms(y=samples, frame_length=512, hop_length=256)
                zcr_arr = librosa.feature.zero_crossing_rate(
                    y=samples, frame_length=512, hop_length=256
                )
                rms_val = float(np.mean(rms_arr))
                zcr_val = float(np.mean(zcr_arr))
            except Exception:
                rms_val = float(np.sqrt(np.mean(np.square(samples))))
                zcr_val = float(np.mean(np.abs(np.diff(np.signbit(samples)))))
        else:
            rms_val = float(np.sqrt(np.mean(np.square(samples))))
            zcr_val = float(np.mean(np.abs(np.diff(np.signbit(samples)))))

        if rms_val < 0.012:
            state, score = "Silence / Passive", 65.0
        elif rms_val > 0.12 or zcr_val > 0.22:
            state, score = "High Noise / Disturbance", 35.0
        else:
            state, score = "Active Speech / Q&A", 100.0

        self.last_state = state
        self.last_score = score
        self.last_rms = rms_val
        self.last_zcr = zcr_val
        return state, score, rms_val, zcr_val


# ---------------------------------------------------------------------------
# EMA Centroid & Bounding-Box Participant Tracker + Engagement Engine
# ---------------------------------------------------------------------------
@dataclass
class TrackedParticipant:
    track_id: int
    student_id: str
    name: str
    bbox: Tuple[float, float, float, float]
    centroid: Tuple[float, float]
    prev_centroid: Tuple[float, float]
    first_seen_ts: float
    last_seen_ts: float
    sustained_sec: float = 0.0
    marked_present: bool = False
    present_timestamp: Optional[str] = None
    sha256_token: str = ""
    head_pose: str = "Focused"
    pose_score: float = 98.0
    movement_state: str = "Attentive"
    movement_score: float = 96.0
    static_streak_sec: float = 0.0
    inactivity_total_sec: float = 0.0
    engagement_score: float = 88.0
    engagement_samples: List[float] = field(default_factory=list)
    peak_engagement: float = 88.0
    missed_frames: int = 0
    inactivity_alert_logged: bool = False

    @property
    def avg_engagement(self) -> float:
        if not self.engagement_samples:
            return self.engagement_score
        return float(np.mean(self.engagement_samples))


class ClassroomTracker:
    """
    Tracks classroom participants with EMA-smoothed bounding boxes and centroids,
    evaluating sustained presence, head pose, movement/inactivity, and multimodal fusion.
    """

    def __init__(
        self,
        roster: List[Tuple[str, str]],
        ema_alpha: float = 0.35,
        max_match_dist: float = 95.0,
        occlusion_grace_sec: float = 1.4,
    ) -> None:
        self.roster = roster if roster else list(DEFAULT_ROSTER)
        self.ema_alpha = ema_alpha
        self.max_match_dist = max_match_dist
        self.occlusion_grace_sec = occlusion_grace_sec
        self.tracks: Dict[int, TrackedParticipant] = {}
        self.retired_tracks: Dict[str, TrackedParticipant] = {}
        self.next_track_num = 1
        self.events: List[Dict[str, str]] = []

    def update_roster(self, roster: List[Tuple[str, str]]) -> None:
        self.roster = roster if roster else list(DEFAULT_ROSTER)
        for tid, tr in self.tracks.items():
            sid, sname = self._assign_identity(tid)
            tr.student_id = sid
            tr.name = sname

    def _assign_identity(self, track_num: int) -> Tuple[str, str]:
        idx = track_num - 1
        if idx < len(self.roster):
            return self.roster[idx]
        return (f"STU-{101 + idx}", f"Participant {track_num}")

    def log_event(self, event_type: str, detail: str) -> None:
        now_str = datetime.datetime.now().strftime("%H:%M:%S")
        self.events.append(
            {"Time": now_str, "Type": event_type, "Detail": detail}
        )
        if len(self.events) > 250:
            self.events = self.events[-250:]

    def step(
        self,
        detections: List[FaceDetection],
        frame_bgr: np.ndarray,
        dt: float,
        presence_threshold_sec: float,
        inactivity_threshold_sec: float,
        audio_state: str,
        audio_score: float,
        weights: Tuple[float, float, float],
    ) -> List[TrackedParticipant]:
        now = time.time()
        dt_clamped = max(0.01, min(dt, 0.5))
        h, w = frame_bgr.shape[:2]

        det_centroids = [
            (d.bbox[0] + 0.5 * d.bbox[2], d.bbox[1] + 0.5 * d.bbox[3])
            for d in detections
        ]

        unmatched_tracks = set(self.tracks.keys())
        unmatched_dets = set(range(len(detections)))
        matched_pairs: List[Tuple[int, int]] = []

        # Greedy nearest-centroid assignment
        if unmatched_tracks and unmatched_dets:
            distances: List[Tuple[float, int, int]] = []
            for tid in unmatched_tracks:
                tcx, tcy = self.tracks[tid].centroid
                for did in unmatched_dets:
                    dcx, dcy = det_centroids[did]
                    dist = float(np.hypot(tcx - dcx, tcy - dcy))
                    if dist <= self.max_match_dist:
                        distances.append((dist, tid, did))
            distances.sort(key=lambda item: item[0])
            for _, tid, did in distances:
                if tid in unmatched_tracks and did in unmatched_dets:
                    matched_pairs.append((tid, did))
                    unmatched_tracks.remove(tid)
                    unmatched_dets.remove(did)

        w_pose, w_move, w_audio = weights

        # Update matched tracks
        for tid, did in matched_pairs:
            tr = self.tracks[tid]
            det = detections[did]
            bx, by, bw, bh = det.bbox
            dcx, dcy = det_centroids[did]

            tr.prev_centroid = tr.centroid
            a = self.ema_alpha
            tr.bbox = (
                a * bx + (1 - a) * tr.bbox[0],
                a * by + (1 - a) * tr.bbox[1],
                a * bw + (1 - a) * tr.bbox[2],
                a * bh + (1 - a) * tr.bbox[3],
            )
            tr.centroid = (
                a * dcx + (1 - a) * tr.centroid[0],
                a * dcy + (1 - a) * tr.centroid[1],
            )
            tr.last_seen_ts = now
            tr.missed_frames = 0
            tr.sustained_sec += dt_clamped

            # 1. Head Pose Analysis (98 pts Focused vs 45 pts Looking Away)
            pose_label, pose_pts = self._analyze_head_pose(
                det, tr.bbox, w, h, frame_bgr
            )
            tr.head_pose = pose_label
            tr.pose_score = pose_pts

            # 2. Movement & Inactivity Analysis
            disp = float(
                np.hypot(
                    tr.centroid[0] - tr.prev_centroid[0],
                    tr.centroid[1] - tr.prev_centroid[1],
                )
            )
            speed_px_sec = disp / dt_clamped
            if speed_px_sec < 12.0:
                tr.static_streak_sec += dt_clamped
                tr.inactivity_total_sec += dt_clamped
                if tr.static_streak_sec >= inactivity_threshold_sec:
                    tr.movement_state = "Static (Inactive)"
                    # Smoothly decay between 72 and 50 pts as static duration extends
                    excess = min(1.0, (tr.static_streak_sec - inactivity_threshold_sec) / 10.0)
                    tr.movement_score = 72.0 - 22.0 * excess
                    if not tr.inactivity_alert_logged:
                        tr.inactivity_alert_logged = True
                        self.log_event(
                            "Inactivity Alert",
                            f"{tr.name} ({tr.student_id}) static for >= {inactivity_threshold_sec:.0f}s",
                        )
                else:
                    tr.movement_state = "Attentive"
                    tr.movement_score = 96.0
            elif speed_px_sec <= 165.0:
                tr.static_streak_sec = max(0.0, tr.static_streak_sec - 2.0 * dt_clamped)
                tr.inactivity_alert_logged = False
                tr.movement_state = "Attentive"
                tr.movement_score = 96.0
            else:
                tr.static_streak_sec = 0.0
                tr.inactivity_alert_logged = False
                tr.movement_state = "Restless"
                tr.movement_score = 42.0

            # 3. Multimodal Signal Fusion
            fused = (
                w_pose * tr.pose_score
                + w_move * tr.movement_score
                + w_audio * audio_score
            )
            tr.engagement_score = float(np.clip(fused, 0.0, 100.0))
            tr.engagement_samples.append(tr.engagement_score)
            if len(tr.engagement_samples) > 3600:
                tr.engagement_samples = tr.engagement_samples[-3600:]
            if tr.engagement_score > tr.peak_engagement:
                tr.peak_engagement = tr.engagement_score

            # 4. Sustained Presence Attendance Commit
            if not tr.marked_present and tr.sustained_sec >= presence_threshold_sec:
                tr.marked_present = True
                tr.present_timestamp = datetime.datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                )
                tr.sha256_token = append_verified_attendance(
                    student_id=tr.student_id,
                    name=tr.name,
                    timestamp=tr.present_timestamp,
                    sustained_sec=tr.sustained_sec,
                    avg_engagement=tr.avg_engagement,
                )
                self.log_event(
                    "Attendance Commit",
                    f"{tr.name} ({tr.student_id}) marked PRESENT after {tr.sustained_sec:.1f}s",
                )

            self.retired_tracks[tr.student_id] = tr

        # Create new tracks for unmatched detections
        for did in unmatched_dets:
            det = detections[did]
            bx, by, bw, bh = det.bbox
            dcx, dcy = det_centroids[did]
            tid = self.next_track_num
            self.next_track_num += 1
            sid, sname = self._assign_identity(tid)

            # Reuse persisted attendance state if same student ID was already verified
            prior = self.retired_tracks.get(sid)
            already_present = prior.marked_present if prior else False
            prior_ts = prior.present_timestamp if prior else None
            prior_tok = prior.sha256_token if prior else ""

            pose_label, pose_pts = self._analyze_head_pose(
                det, (float(bx), float(by), float(bw), float(bh)), w, h, frame_bgr
            )
            init_eng = float(
                np.clip(
                    w_pose * pose_pts + w_move * 96.0 + w_audio * audio_score, 0.0, 100.0
                )
            )
            tr = TrackedParticipant(
                track_id=tid,
                student_id=sid,
                name=sname,
                bbox=(float(bx), float(by), float(bw), float(bh)),
                centroid=(dcx, dcy),
                prev_centroid=(dcx, dcy),
                first_seen_ts=now,
                last_seen_ts=now,
                sustained_sec=0.0,
                marked_present=already_present,
                present_timestamp=prior_ts,
                sha256_token=prior_tok,
                head_pose=pose_label,
                pose_score=pose_pts,
                movement_state="Attentive",
                movement_score=96.0,
                engagement_score=init_eng,
                engagement_samples=[init_eng],
                peak_engagement=init_eng,
            )
            self.tracks[tid] = tr
            self.retired_tracks[sid] = tr
            self.log_event("Arrival", f"{sname} ({sid}) entered classroom frame")

        # Handle occluded / missing tracks cleanly without single-frame resets
        to_remove: List[int] = []
        for tid in unmatched_tracks:
            tr = self.tracks[tid]
            tr.missed_frames += 1
            if (now - tr.last_seen_ts) > self.occlusion_grace_sec:
                to_remove.append(tid)
                self.retired_tracks[tr.student_id] = tr

        for tid in to_remove:
            del self.tracks[tid]

        return list(self.tracks.values())

    @staticmethod
    def _analyze_head_pose(
        det: FaceDetection,
        bbox: Tuple[float, float, float, float],
        frame_w: int,
        frame_h: int,
        frame_bgr: np.ndarray,
    ) -> Tuple[str, float]:
        if det.pose_hint is not None:
            if det.pose_hint == "Looking Away":
                return "Looking Away", 45.0
            return "Focused", 98.0

        bx, by, bw, bh = bbox
        norm_cx = (bx + 0.5 * bw) / max(1.0, float(frame_w))
        norm_cy = (by + 0.5 * bh) / max(1.0, float(frame_h))
        ar = bw / max(1.0, bh)

        # Extreme edge framing or skewed facial box aspect ratio
        if norm_cx < 0.08 or norm_cx > 0.92 or norm_cy < 0.06 or norm_cy > 0.90:
            return "Looking Away", 45.0
        if ar < 0.68 or ar > 1.28:
            return "Looking Away", 45.0

        # Bilateral facial brightness symmetry check (detects sharp profile turn)
        x1 = max(0, int(bx))
        y1 = max(0, int(by))
        x2 = min(frame_w, int(bx + bw))
        y2 = min(frame_h, int(by + bh))
        if x2 - x1 >= 24 and y2 - y1 >= 24:
            roi = cv2.cvtColor(frame_bgr[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
            mid = roi.shape[1] // 2
            left_mean = float(np.mean(roi[:, :mid]))
            right_mean = float(np.mean(roi[:, mid:]))
            asym = abs(left_mean - right_mean) / max(1.0, 0.5 * (left_mean + right_mean))
            if asym > 0.34:
                return "Looking Away", 45.0

        return "Focused", 98.0


# ---------------------------------------------------------------------------
# Pedagogical Decision-Support Banner Engine (Scenario 3)
# ---------------------------------------------------------------------------
def build_teaching_suggestion(
    active_tracks: List[TrackedParticipant],
    class_engagement: float,
    audio_state: str,
    inactivity_threshold_sec: float,
    dark_mode: bool,
) -> Dict[str, str]:
    """Generate real-time, non-enforcing pedagogical guidance from classroom state."""
    n_faces = len(active_tracks)

    def _palette(level: str) -> Tuple[str, str, str]:
        if dark_mode:
            return {
                "info": ("#0F2942", "#38BDF8", "#E0F2FE"),
                "warn": ("#3B2608", "#F59E0B", "#FEF3C7"),
                "alert": ("#3B1219", "#F43F5E", "#FFE4E6"),
                "success": ("#063125", "#10B981", "#D1FAE5"),
            }[level]
        return {
            "info": ("#EFF6FF", "#2563EB", "#1E3A8A"),
            "warn": ("#FFFBEB", "#D97706", "#78350F"),
            "alert": ("#FFF1F2", "#E11D48", "#881337"),
            "success": ("#ECFDF5", "#059669", "#064E3B"),
        }[level]

    if n_faces == 0:
        bg, border, fg = _palette("info")
        return {
            "title": "📡 Standby — Camera Angle & Coverage Check",
            "body": (
                "0 participants detected in frame. Verify webcam angle, classroom "
                "lighting, or upload a recorded lecture clip from the sidebar."
            ),
            "bg": bg,
            "border": border,
            "fg": fg,
        }

    max_static = max((t.static_streak_sec for t in active_tracks), default=0.0)
    looking_away_cnt = sum(1 for t in active_tracks if t.head_pose == "Looking Away")
    majority_looking_away = looking_away_cnt >= max(1, n_faces / 2.0)

    if max_static >= inactivity_threshold_sec:
        bg, border, fg = _palette("warn")
        return {
            "title": f"⏸️ Passive / Static Learners Detected ({max_static:.1f}s Inactivity)",
            "body": (
                "Participants appear static and passive. Consider launching a quick "
                "1-question live poll, think-pair-share prompt, or physical stretch check-in."
            ),
            "bg": bg,
            "border": border,
            "fg": fg,
        }

    if class_engagement < 55.0 and majority_looking_away:
        bg, border, fg = _palette("alert")
        return {
            "title": "👀 Attention Drop Alert — Visual Focus Declining (<55%)",
            "body": (
                f"{looking_away_cnt}/{n_faces} learners are looking away. Introduce a "
                "visual diagram, worked example, or rapid concept-check question to re-anchor focus."
            ),
            "bg": bg,
            "border": border,
            "fg": fg,
        }

    if class_engagement < 55.0 and audio_state == "High Noise / Disturbance":
        bg, border, fg = _palette("alert")
        return {
            "title": "🔊 Classroom Management Alert — High Ambient Noise (<55%)",
            "body": (
                "Elevated background noise detected alongside low engagement. Pause "
                "briefly for a structured reset or clarify the current task instructions."
            ),
            "bg": bg,
            "border": border,
            "fg": fg,
        }

    if class_engagement < 55.0:
        bg, border, fg = _palette("warn")
        return {
            "title": "📉 Engagement Dip Detected (<55%)",
            "body": (
                "Overall multimodal engagement is below target. Switch instructional "
                "pacing with a concrete real-world analogy or interactive cold-call prompt."
            ),
            "bg": bg,
            "border": border,
            "fg": fg,
        }

    if class_engagement > 78.0:
        bg, border, fg = _palette("success")
        return {
            "title": "🚀 Peak Engagement Window (>78%) — Optimal Cognitive Readiness",
            "body": (
                "Class attention and participation are peaking. This is the ideal window "
                "to introduce complex derivations, deeper synthesis, or challenge problems."
            ),
            "bg": bg,
            "border": border,
            "fg": fg,
        }

    bg, border, fg = _palette("info")
    return {
        "title": "✅ Steady Classroom State (55%–78%)",
        "body": (
            "Learners are maintaining steady attention. Encourage open Q&A or invite a "
            "student to summarize the key takeaway before advancing."
        ),
        "bg": bg,
        "border": border,
        "fg": fg,
    }


# ---------------------------------------------------------------------------
# OpenCV Frame HUD Renderer (640x480 Standardized)
# ---------------------------------------------------------------------------
def render_hud_frame(
    frame_bgr: np.ndarray,
    tracks: List[TrackedParticipant],
    presence_threshold_sec: float,
    class_engagement: float,
    audio_state: str,
    fps: float,
    tier_label: str,
) -> np.ndarray:
    """Draw smoothed bounding boxes, sustained presence bars, and telemetry HUD."""
    canvas = cv2.resize(frame_bgr, (FRAME_WIDTH, FRAME_HEIGHT))

    # Top translucent HUD strip
    overlay = canvas.copy()
    cv2.rectangle(overlay, (0, 0), (FRAME_WIDTH, 34), (15, 23, 42), -1)
    cv2.addWeighted(overlay, 0.72, canvas, 0.28, 0, canvas)

    hud_left = f"AttendAI | {tier_label.split(':')[0]} | Faces: {len(tracks)}"
    hud_right = f"Eng: {class_engagement:.0f}% | {audio_state.split('/')[0].strip()} | {fps:.1f} FPS"
    cv2.putText(
        canvas, hud_left, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (248, 250, 252), 1, cv2.LINE_AA
    )
    cv2.putText(
        canvas, hud_right, (305, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (56, 189, 248), 1, cv2.LINE_AA
    )

    for tr in tracks:
        x, y, w, h = [int(round(v)) for v in tr.bbox]
        x = max(0, min(FRAME_WIDTH - 10, x))
        y = max(36, min(FRAME_HEIGHT - 10, y))
        w = max(10, min(FRAME_WIDTH - x, w))
        h = max(10, min(FRAME_HEIGHT - y, h))

        if tr.marked_present:
            box_color = (16, 185, 129)  # Emerald Green (RGB) -> BGR: (129, 185, 16)
            bgr_color = (129, 185, 16)
            status_txt = f"PRESENT | {tr.engagement_score:.0f}%"
        elif tr.static_streak_sec >= 8.0 or tr.head_pose == "Looking Away":
            box_color = (245, 158, 11)
            bgr_color = (11, 158, 245)
            status_txt = f"{tr.sustained_sec:.1f}s/{presence_threshold_sec:.0f}s | {tr.head_pose}"
        else:
            box_color = (56, 189, 248)
            bgr_color = (248, 189, 56)
            status_txt = f"WAIT {tr.sustained_sec:.1f}s/{presence_threshold_sec:.0f}s"

        # Bounding box
        cv2.rectangle(canvas, (x, y), (x + w, y + h), bgr_color, 2)

        # Header pill above box
        label = f"{tr.student_id} {tr.name.split()[0]}"
        label_y = max(52, y - 8)
        cv2.rectangle(canvas, (x, label_y - 18), (min(FRAME_WIDTH, x + max(w, 165)), label_y + 2), bgr_color, -1)
        cv2.putText(
            canvas,
            label,
            (x + 4, label_y - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.46,
            (15, 23, 42),
            1,
            cv2.LINE_AA,
        )

        # Sustained presence progress bar directly on bounding box bottom
        progress = (
            1.0
            if tr.marked_present
            else min(1.0, tr.sustained_sec / max(1.0, presence_threshold_sec))
        )
        bar_y1 = min(FRAME_HEIGHT - 14, y + h + 4)
        bar_y2 = min(FRAME_HEIGHT - 6, bar_y1 + 8)
        bar_w = max(w, 120)
        bar_x2 = min(FRAME_WIDTH - 4, x + bar_w)
        cv2.rectangle(canvas, (x, bar_y1), (bar_x2, bar_y2), (30, 41, 59), -1)
        fill_w = int((bar_x2 - x) * progress)
        if fill_w > 0:
            cv2.rectangle(canvas, (x, bar_y1), (x + fill_w, bar_y2), bgr_color, -1)

        # Timer & Engagement text below progress bar
        txt_y = min(FRAME_HEIGHT - 4, bar_y2 + 14)
        cv2.putText(
            canvas,
            status_txt,
            (x, txt_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            bgr_color,
            1,
            cv2.LINE_AA,
        )

    return cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)


def make_standby_frame(dark_mode: bool, message: str) -> np.ndarray:
    """Create a 640x480 crisp standby canvas when camera is stopped."""
    bg = (15, 23, 42) if dark_mode else (241, 245, 249)
    fg = (248, 250, 252) if dark_mode else (15, 23, 42)
    accent = (56, 189, 248) if dark_mode else (2, 132, 199)
    sub = (148, 163, 184) if dark_mode else (71, 85, 105)

    canvas = np.full((FRAME_HEIGHT, FRAME_WIDTH, 3), bg, dtype=np.uint8)
    cv2.rectangle(canvas, (18, 18), (FRAME_WIDTH - 18, FRAME_HEIGHT - 18), accent, 2)
    cv2.putText(
        canvas,
        "AttendAI Classroom Vision Standby",
        (115, 205),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.78,
        fg,
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        message,
        (118, 248),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        accent,
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        "100% Offline | Zero Raw Video Stored | Privacy-First",
        (112, 286),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        sub,
        1,
        cv2.LINE_AA,
    )
    return canvas


# ---------------------------------------------------------------------------
# Altair Engagement Trend Chart
# ---------------------------------------------------------------------------
def build_engagement_chart(
    history: List[Dict[str, Any]], dark_mode: bool
) -> alt.Chart:
    text_col = "#E2E8F0" if dark_mode else "#1E293B"
    grid_col = "#2E3B52" if dark_mode else "#E2E8F0"
    bg_col = "#162033" if dark_mode else "#FFFFFF"

    if not history:
        df = pd.DataFrame(
            [{"Step": 0, "Time": "00:00:00", "Engagement": 0.0}]
        )
    else:
        df = pd.DataFrame(history[-90:])

    base = alt.Chart(df).encode(
        x=alt.X(
            "Step:Q",
            title="Session Timeline (Samples)",
            axis=alt.Axis(labelColor=text_col, titleColor=text_col, gridColor=grid_col),
        ),
        y=alt.Y(
            "Engagement:Q",
            title="Engagement (%)",
            scale=alt.Scale(domain=[0, 100]),
            axis=alt.Axis(labelColor=text_col, titleColor=text_col, gridColor=grid_col),
        ),
    )

    area = base.mark_area(
        line={"color": "#38BDF8" if dark_mode else "#0284C7", "strokeWidth": 2.5},
        color=alt.Gradient(
            gradient="linear",
            stops=[
                alt.GradientStop(color="rgba(56, 189, 248, 0.35)", offset=0),
                alt.GradientStop(color="rgba(56, 189, 248, 0.03)", offset=1),
            ],
            x1=1,
            x2=1,
            y1=1,
            y2=0,
        ),
    ).encode(
        tooltip=["Time:N", alt.Tooltip("Engagement:Q", format=".1f")]
    )

    drop_rule = (
        alt.Chart(pd.DataFrame({"y": [55], "Label": ["Attention Drop (55%)"]}))
        .mark_rule(color="#F43F5E", strokeDash=[5, 4], strokeWidth=1.5)
        .encode(y="y:Q")
    )
    peak_rule = (
        alt.Chart(pd.DataFrame({"y": [78], "Label": ["Peak Window (78%)"]}))
        .mark_rule(color="#10B981", strokeDash=[5, 4], strokeWidth=1.5)
        .encode(y="y:Q")
    )

    chart = (
        (area + drop_rule + peak_rule)
        .properties(height=250, title="Session Engagement Trend (Live Multimodal Score)")
        .configure_view(strokeWidth=0, fill=bg_col)
        .configure(background=bg_col)
        .configure_title(color=text_col, fontSize=13, anchor="start")
    )
    return chart


# ---------------------------------------------------------------------------
# Session State Initialization & Reset
# ---------------------------------------------------------------------------
def parse_roster_text(raw_text: str) -> List[Tuple[str, str]]:
    parsed: List[Tuple[str, str]] = []
    for i, line in enumerate(raw_text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        if "," in line:
            sid, name = line.split(",", 1)
            parsed.append((sid.strip() or f"STU-{100+i}", name.strip() or f"Student {i}"))
        else:
            parsed.append((f"STU-{100+i}", line))
    return parsed if parsed else list(DEFAULT_ROSTER)


def init_session_state() -> None:
    ensure_csv_files_exist()
    if "dark_mode" not in st.session_state:
        st.session_state.dark_mode = True
    if "camera_running" not in st.session_state:
        st.session_state.camera_running = False
    if "roster_text" not in st.session_state:
        st.session_state.roster_text = "\n".join(
            f"{sid}, {name}" for sid, name in DEFAULT_ROSTER
        )
    if "tracker" not in st.session_state:
        st.session_state.tracker = ClassroomTracker(
            parse_roster_text(st.session_state.roster_text)
        )
    if "audio_monitor" not in st.session_state:
        st.session_state.audio_monitor = OfflineAudioMonitor()
    if "engagement_history" not in st.session_state:
        st.session_state.engagement_history = []
    if "session_start_ts" not in st.session_state:
        st.session_state.session_start_ts = time.time()
    if "attention_drop_count" not in st.session_state:
        st.session_state.attention_drop_count = 0
    if "in_drop_state" not in st.session_state:
        st.session_state.in_drop_state = False
    if "peak_engagement" not in st.session_state:
        st.session_state.peak_engagement = 0.0
    if "last_class_engagement" not in st.session_state:
        st.session_state.last_class_engagement = 0.0
    if "last_audio_state" not in st.session_state:
        st.session_state.last_audio_state = "Silence / Passive"
    if "last_fps" not in st.session_state:
        st.session_state.last_fps = 0.0
    if "uploaded_video_path" not in st.session_state:
        st.session_state.uploaded_video_path = None
    if "uploaded_video_sig" not in st.session_state:
        st.session_state.uploaded_video_sig = None


def reset_session_state() -> None:
    st.session_state.camera_running = False
    try:
        st.session_state.audio_monitor.stop()
    except Exception:
        pass
    st.session_state.tracker = ClassroomTracker(
        parse_roster_text(st.session_state.roster_text)
    )
    st.session_state.engagement_history = []
    st.session_state.session_start_ts = time.time()
    st.session_state.attention_drop_count = 0
    st.session_state.in_drop_state = False
    st.session_state.peak_engagement = 0.0
    st.session_state.last_class_engagement = 0.0
    st.session_state.last_audio_state = "Silence / Passive"
    st.session_state.last_fps = 0.0


# ---------------------------------------------------------------------------
# Camera Opener (macOS AVFoundation + 640x480 @ 30 FPS)
# ---------------------------------------------------------------------------
def open_video_source(
    source_mode: str, webcam_index: int, uploaded_path: Optional[str]
) -> Optional[cv2.VideoCapture]:
    if source_mode == "Upload Classroom Video (.mp4/.mov/.avi)":
        if not uploaded_path or not os.path.exists(uploaded_path):
            return None
        cap = cv2.VideoCapture(uploaded_path)
        return cap if cap.isOpened() else None

    if platform.system() == "Darwin":
        cap = cv2.VideoCapture(webcam_index, cv2.CAP_AVFOUNDATION)
        if not cap.isOpened():
            cap = cv2.VideoCapture(webcam_index)
    else:
        cap = cv2.VideoCapture(webcam_index)

    if not cap.isOpened():
        return None

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)
    return cap


# ---------------------------------------------------------------------------
# Roster Table Formatter
# ---------------------------------------------------------------------------
def build_live_roster_df(
    tracks: List[TrackedParticipant], presence_threshold_sec: float
) -> pd.DataFrame:
    rows = []
    for tr in tracks:
        pct = (
            1.0
            if tr.marked_present
            else min(1.0, tr.sustained_sec / max(1.0, presence_threshold_sec))
        )
        status_label = (
            "✅ PRESENT"
            if tr.marked_present
            else f"⏳ {tr.sustained_sec:.1f}s / {presence_threshold_sec:.0f}s"
        )
        rows.append(
            {
                "ID": tr.student_id,
                "Name": tr.name,
                "Status": status_label,
                "Presence_Progress": round(pct * 100.0, 1),
                "Head_Pose": tr.head_pose,
                "Inactivity_s": round(tr.inactivity_total_sec, 1),
                "Engagement_Pct": round(tr.engagement_score, 1),
            }
        )
    if not rows:
        return pd.DataFrame(
            columns=[
                "ID",
                "Name",
                "Status",
                "Presence_Progress",
                "Head_Pose",
                "Inactivity_s",
                "Engagement_Pct",
            ]
        )
    return pd.DataFrame(rows)


def render_roster_table(
    placeholder: Any, df: pd.DataFrame, presence_threshold_sec: float
) -> None:
    placeholder.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "ID": st.column_config.TextColumn("ID", width="small"),
            "Name": st.column_config.TextColumn("Participant", width="medium"),
            "Status": st.column_config.TextColumn(
                f"Presence ({presence_threshold_sec:.0f}s)", width="medium"
            ),
            "Presence_Progress": st.column_config.ProgressColumn(
                "Timer",
                help="Sustained presence progress toward PRESENT verification",
                format="%.0f%%",
                min_value=0,
                max_value=100,
            ),
            "Head_Pose": st.column_config.TextColumn("Head Pose", width="small"),
            "Inactivity_s": st.column_config.NumberColumn(
                "Inactivity (s)", format="%.1fs", width="small"
            ),
            "Engagement_Pct": st.column_config.ProgressColumn(
                "Engagement",
                format="%.0f%%",
                min_value=0,
                max_value=100,
            ),
        },
    )


# ---------------------------------------------------------------------------
# Tab 2, Tab 3, Tab 4 Renderers
# ---------------------------------------------------------------------------
def render_tab2_analytics(dark_mode: bool) -> None:
    tracker: ClassroomTracker = st.session_state.tracker
    history: List[Dict[str, Any]] = st.session_state.engagement_history
    duration_sec = int(time.time() - st.session_state.session_start_ts)
    mins, secs = divmod(duration_sec, 60)

    mean_eng = (
        float(np.mean([h["Engagement"] for h in history])) if history else 0.0
    )
    peak_eng = float(st.session_state.peak_engagement)
    drop_cnt = int(st.session_state.attention_drop_count)

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Mean Session Engagement", f"{mean_eng:.1f}%")
    k2.metric("Interaction Peak", f"{peak_eng:.1f}%")
    k3.metric("Attention Drop Count (<55%)", f"{drop_cnt}")
    k4.metric("Session Duration", f"{mins:02d}:{secs:02d}")

    st.markdown("### Per-Participant Session Summary")
    all_seen: Dict[str, TrackedParticipant] = dict(tracker.retired_tracks)
    for tr in tracker.tracks.values():
        all_seen[tr.student_id] = tr

    if all_seen:
        summary_rows = []
        for sid, tr in sorted(all_seen.items()):
            summary_rows.append(
                {
                    "Student_ID": sid,
                    "Name": tr.name,
                    "Status": "✅ PRESENT" if tr.marked_present else "⏳ Tracking",
                    "Sustained_Sec": round(tr.sustained_sec, 1),
                    "Avg_Engagement_%": round(tr.avg_engagement, 1),
                    "Peak_Engagement_%": round(tr.peak_engagement, 1),
                    "Total_Inactivity_s": round(tr.inactivity_total_sec, 1),
                    "Latest_Head_Pose": tr.head_pose,
                    "Verified_At": tr.present_timestamp or "—",
                }
            )
        st.dataframe(
            pd.DataFrame(summary_rows), use_container_width=True, hide_index=True
        )
    else:
        st.info(
            "No participant telemetry recorded yet. Start the Camera Agent in Tab 1 to capture live session dynamics."
        )

    c_left, c_right = st.columns([1.2, 1.0])
    with c_left:
        st.markdown("### Automated Classroom Event Timeline")
        if tracker.events:
            ev_df = pd.DataFrame(list(reversed(tracker.events)))
            event_types = ["All"] + sorted(ev_df["Type"].unique().tolist())
            selected_ev = st.selectbox(
                "Filter Event Category", event_types, key="timeline_filter"
            )
            if selected_ev != "All":
                ev_df = ev_df[ev_df["Type"] == selected_ev]
            st.dataframe(ev_df, use_container_width=True, hide_index=True, height=280)
        else:
            st.info("Classroom events (arrivals, commits, attention drops) will appear here.")

    with c_right:
        st.markdown("### Session Engagement Distribution")
        if history:
            hdf = pd.DataFrame(history)
            hdf["Band"] = pd.cut(
                hdf["Engagement"],
                bins=[-1, 54.99, 78.0, 101],
                labels=["Drop (<55%)", "Steady (55-78%)", "Peak (>78%)"],
            )
            band_counts = hdf["Band"].value_counts().reset_index()
            band_counts.columns = ["Band", "Samples"]
            text_col = "#E2E8F0" if dark_mode else "#1E293B"
            bg_col = "#162033" if dark_mode else "#FFFFFF"
            bar = (
                alt.Chart(band_counts)
                .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6)
                .encode(
                    x=alt.X(
                        "Band:N",
                        title="Engagement Band",
                        axis=alt.Axis(labelColor=text_col, titleColor=text_col),
                    ),
                    y=alt.Y(
                        "Samples:Q",
                        title="Observations",
                        axis=alt.Axis(labelColor=text_col, titleColor=text_col),
                    ),
                    color=alt.Color(
                        "Band:N",
                        scale=alt.Scale(
                            domain=["Drop (<55%)", "Steady (55-78%)", "Peak (>78%)"],
                            range=["#F43F5E", "#38BDF8", "#10B981"],
                        ),
                        legend=None,
                    ),
                    tooltip=["Band", "Samples"],
                )
                .properties(height=280)
                .configure_view(strokeWidth=0, fill=bg_col)
                .configure(background=bg_col)
            )
            st.altair_chart(bar, use_container_width=True)
        else:
            st.info("Start monitoring to populate the engagement band breakdown.")


def render_tab3_safe_leave_simulator(dark_mode: bool) -> None:
    st.markdown("### 🧮 Student Safe-Leave & 75% Exam Eligibility Simulator")
    st.caption(
        "Self-service projection tool against the mandatory 75.0% minimum attendance threshold."
    )

    roster = parse_roster_text(st.session_state.roster_text)
    profile_options = [f"{sid} — {name}" for sid, name in roster]

    col_in, col_out = st.columns([1.0, 1.35])
    with col_in:
        selected_profile = st.selectbox(
            "Select Student Profile", profile_options, key="sim_profile"
        )
        total_conducted = st.number_input(
            "Total Classes Conducted",
            min_value=1,
            max_value=500,
            value=94,
            step=1,
            key="sim_conducted",
        )
        attended_classes = st.number_input(
            "Classes Attended",
            min_value=0,
            max_value=int(total_conducted),
            value=min(87, int(total_conducted)),
            step=1,
            key="sim_attended",
        )
        planned_misses = st.slider(
            "Simulate Missing Upcoming Classes",
            min_value=0,
            max_value=15,
            value=3,
            step=1,
            key="sim_misses",
        )

    current_pct = (attended_classes / max(1, total_conducted)) * 100.0
    projected_total = total_conducted + planned_misses
    projected_pct = (attended_classes / max(1, projected_total)) * 100.0

    # Max future consecutive misses while staying >= 75%:
    # attended / (total + x) >= 0.75 => x <= (attended / 0.75) - total
    max_safe_total = int(np.floor(attended_classes / 0.75))
    safe_leave_buffer = max(0, max_safe_total - int(total_conducted))

    # If currently below 75% or projected below 75%, compute recovery classes needed
    # (attended + r) / (projected_total + r) >= 0.75 => 0.25*r >= 0.75*projected_total - attended
    if projected_pct < 75.0:
        recovery_needed = int(
            np.ceil((0.75 * projected_total - attended_classes) / 0.25)
        )
    else:
        recovery_needed = 0

    with col_out:
        m1, m2, m3 = st.columns(3)
        m1.metric("Current Attendance", f"{current_pct:.2f}%")
        m2.metric(
            "Projected Attendance",
            f"{projected_pct:.2f}%",
            delta=f"{projected_pct - current_pct:+.2f}%",
        )
        m3.metric(
            "Safe Leave Buffer",
            f"{safe_leave_buffer} class(es)",
            delta=">= 75% Rule",
        )

        if projected_pct >= 75.0:
            bg = "#063125" if dark_mode else "#ECFDF5"
            border = "#10B981" if dark_mode else "#059669"
            fg = "#D1FAE5" if dark_mode else "#064E3B"
            remaining_after_plan = max(0, safe_leave_buffer - planned_misses)
            st.markdown(
                f"""
                <div class="suggestion-banner" style="background:{bg}; border-left-color:{border}; color:{fg};">
                    <div class="banner-title" style="color:{fg};">✅ Safe Zone — Exam Eligible ({selected_profile})</div>
                    <div class="banner-body" style="color:{fg};">
                        After missing <b>{planned_misses}</b> upcoming class(es), projected attendance is
                        <b>{projected_pct:.2f}%</b> (above the 75.0% threshold). You retain a remaining
                        buffer of <b>{remaining_after_plan}</b> additional safe leave(s).
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            bg = "#3B1219" if dark_mode else "#FFF1F2"
            border = "#F43F5E" if dark_mode else "#E11D48"
            fg = "#FFE4E6" if dark_mode else "#881337"
            st.markdown(
                f"""
                <div class="suggestion-banner" style="background:{bg}; border-left-color:{border}; color:{fg};">
                    <div class="banner-title" style="color:{fg};">⚠️ Compliance Warning — Below 75% Threshold ({selected_profile})</div>
                    <div class="banner-body" style="color:{fg};">
                        Missing <b>{planned_misses}</b> class(es) drops attendance to
                        <b>{projected_pct:.2f}%</b>. You would need to attend <b>{recovery_needed}</b>
                        consecutive classes afterward to restore 75.0% exam eligibility.
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        # Projection Curve across 0..15 missed classes
        proj_rows = []
        for m in range(0, 16):
            pct_m = (attended_classes / max(1, total_conducted + m)) * 100.0
            proj_rows.append({"Missed_Classes": m, "Attendance_Pct": pct_m})
        proj_df = pd.DataFrame(proj_rows)

        text_col = "#E2E8F0" if dark_mode else "#1E293B"
        grid_col = "#2E3B52" if dark_mode else "#E2E8F0"
        bg_col = "#162033" if dark_mode else "#FFFFFF"

        line = (
            alt.Chart(proj_df)
            .mark_line(point=True, color="#38BDF8" if dark_mode else "#0284C7", strokeWidth=2.5)
            .encode(
                x=alt.X(
                    "Missed_Classes:Q",
                    title="Upcoming Classes Missed",
                    axis=alt.Axis(labelColor=text_col, titleColor=text_col, gridColor=grid_col),
                ),
                y=alt.Y(
                    "Attendance_Pct:Q",
                    title="Projected Attendance (%)",
                    scale=alt.Scale(domain=[max(40, int(proj_df["Attendance_Pct"].min()) - 5), 100]),
                    axis=alt.Axis(labelColor=text_col, titleColor=text_col, gridColor=grid_col),
                ),
                tooltip=["Missed_Classes", alt.Tooltip("Attendance_Pct:Q", format=".2f")],
            )
        )
        rule75 = (
            alt.Chart(pd.DataFrame({"y": [75.0]}))
            .mark_rule(color="#F43F5E", strokeDash=[6, 4], strokeWidth=2)
            .encode(y="y:Q")
        )
        sel_pt = (
            alt.Chart(pd.DataFrame({"Missed_Classes": [planned_misses], "Attendance_Pct": [projected_pct]}))
            .mark_point(size=140, color="#10B981" if projected_pct >= 75 else "#F43F5E", filled=True)
            .encode(x="Missed_Classes:Q", y="Attendance_Pct:Q")
        )
        sim_chart = (
            (line + rule75 + sel_pt)
            .properties(height=230, title="Attendance Trajectory vs. 75% Mandatory Threshold")
            .configure_view(strokeWidth=0, fill=bg_col)
            .configure(background=bg_col)
            .configure_title(color=text_col, fontSize=13, anchor="start")
        )
        st.altair_chart(sim_chart, use_container_width=True)


def render_tab4_audit_logs() -> None:
    att_df = read_attendance_csv()
    ledger_df = read_audit_ledger_csv()

    col_att, col_aud = st.columns(2)

    with col_att:
        st.markdown("### 📋 Offline Attendance Session Logs")
        st.caption(f"Backed locally by `{ATTENDANCE_CSV_PATH}` ({len(att_df)} record(s))")
        st.dataframe(att_df, use_container_width=True, hide_index=True, height=340)

        b1, b2 = st.columns(2)
        with b1:
            st.download_button(
                "⬇️ Export Attendance CSV",
                data=att_df.to_csv(index=False).encode("utf-8"),
                file_name="attendance_session_logs.csv",
                mime="text/csv",
                use_container_width=True,
                key="dl_att_csv",
            )
        with b2:
            if st.button(
                "🗑️ Clear Attendance CSV",
                use_container_width=True,
                key="clear_att_csv",
            ):
                pd.DataFrame(columns=ATTENDANCE_COLUMNS).to_csv(
                    ATTENDANCE_CSV_PATH, index=False
                )
                st.rerun()

    with col_aud:
        st.markdown("### 🔐 Immutable SHA-256 Audit Ledger")
        st.caption(
            f"Hash-chained tamper-proof ledger `{AUDIT_LEDGER_CSV_PATH}` ({len(ledger_df)} commit(s))"
        )
        st.dataframe(ledger_df, use_container_width=True, hide_index=True, height=340)

        a1, a2 = st.columns(2)
        with a1:
            st.download_button(
                "⬇️ Export Audit Ledger CSV",
                data=ledger_df.to_csv(index=False).encode("utf-8"),
                file_name="attendance_audit_ledger.csv",
                mime="text/csv",
                use_container_width=True,
                key="dl_audit_csv",
            )
        with a2:
            if st.button(
                "🛡️ Verify SHA-256 Chain",
                use_container_width=True,
                key="verify_audit_chain",
            ):
                ok, msg = verify_audit_ledger_integrity(ledger_df)
                if ok:
                    st.success(msg)
                else:
                    st.error(msg)


# ---------------------------------------------------------------------------
# Main Application Entry Point
# ---------------------------------------------------------------------------
def main() -> None:
    init_session_state()

    # ---------------- Sidebar Control Panel ----------------
    with st.sidebar:
        st.markdown("## ⚙️ AttendAI Control Panel")
        dark_mode = st.toggle(
            "🌙 Dark Theme",
            value=st.session_state.dark_mode,
            key="dark_mode_toggle",
        )
        st.session_state.dark_mode = dark_mode

        st.divider()
        st.markdown("### 📷 Video & Vision Engine")
        source_mode = st.radio(
            "Input Stream Source",
            ["Live Webcam", "Upload Classroom Video (.mp4/.mov/.avi)"],
            key="video_source_mode",
        )
        webcam_idx = 0
        if source_mode == "Live Webcam":
            webcam_idx = int(
                st.number_input(
                    "Webcam Device Index", min_value=0, max_value=5, value=0, step=1
                )
            )
        else:
            uploaded_file = st.file_uploader(
                "Upload Classroom Video",
                type=["mp4", "mov", "avi"],
                key="video_uploader",
            )
            if uploaded_file is not None:
                sig = f"{uploaded_file.name}:{uploaded_file.size}"
                if st.session_state.uploaded_video_sig != sig:
                    suffix = Path(uploaded_file.name).suffix or ".mp4"
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                    tmp.write(uploaded_file.read())
                    tmp.close()
                    st.session_state.uploaded_video_path = tmp.name
                    st.session_state.uploaded_video_sig = sig

        detector_pref = st.selectbox(
            "Face Detection Pipeline",
            ["Auto (3-Tier Fallback)", "Tier 3 (OpenCV 5.0 Core)"],
            key="detector_pref",
        )

        st.divider()
        st.markdown("### ⏱️ Attendance & Inactivity Rules")
        presence_threshold = float(
            st.slider(
                "Sustained Presence Threshold (s)",
                min_value=3,
                max_value=45,
                value=8,
                step=1,
                help="Participant must stay continuously tracked for this duration to be marked PRESENT.",
            )
        )
        inactivity_threshold = float(
            st.slider(
                "Static Inactivity Alert Threshold (s)",
                min_value=4,
                max_value=20,
                value=8,
                step=1,
            )
        )

        st.divider()
        st.markdown("### 🎚️ Multimodal Fusion Weights")
        raw_pose = st.slider("Head Pose Weight", 0.0, 1.0, 0.50, 0.05)
        raw_move = st.slider("Movement / Inactivity Weight", 0.0, 1.0, 0.25, 0.05)
        raw_audio = st.slider("Audio Activity Weight", 0.0, 1.0, 0.25, 0.05)

        w_sum = raw_pose + raw_move + raw_audio
        if w_sum <= 0.0:
            w_pose, w_move, w_audio = 0.50, 0.25, 0.25
        else:
            w_pose = raw_pose / w_sum
            w_move = raw_move / w_sum
            w_audio = raw_audio / w_sum
        st.caption(
            f"Normalized: Pose {w_pose:.0%} | Move {w_move:.0%} | Audio {w_audio:.0%}"
        )

        audio_mode = st.selectbox(
            "Audio Signal Source",
            ["Live Microphone", "Simulated Q&A Cycle", "Muted Fallback (65 pts)"],
            key="audio_source_mode",
        )

        with st.expander("👥 Classroom Roster Mapping"):
            edited_roster = st.text_area(
                "Student_ID, Name (one per line)",
                value=st.session_state.roster_text,
                height=160,
            )
            if edited_roster != st.session_state.roster_text:
                st.session_state.roster_text = edited_roster
                st.session_state.tracker.update_roster(
                    parse_roster_text(edited_roster)
                )

    apply_theme_css(dark_mode)

    # ---------------- Top Header Bar ----------------
    h_info, h_btn1, h_btn2 = st.columns([3.6, 1.1, 0.9])
    with h_info:
        st.markdown(
            f"""
            <div class="attendai-header">
                <div class="attendai-title">🎓 {APP_TITLE}</div>
                <div class="attendai-subtitle">
                    Privacy-Preserving Offline Classroom Intelligence · Sustained Presence · Multimodal Engagement · SHA-256 Ledger
                </div>
                <span class="attendai-badge">100% OFFLINE · OPENCV {cv2.__version__} READY</span>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with h_btn1:
        st.write("")
        toggle_label = (
            "⏹️ Stop Camera Agent"
            if st.session_state.camera_running
            else "▶️ Start Camera Agent"
        )
        if st.button(
            toggle_label,
            type="primary",
            use_container_width=True,
            key="btn_toggle_cam",
        ):
            st.session_state.camera_running = not st.session_state.camera_running
            if not st.session_state.camera_running:
                st.session_state.audio_monitor.stop()
            st.rerun()

    with h_btn2:
        st.write("")
        if st.button(
            "🔄 Reset Session",
            use_container_width=True,
            key="btn_reset_session",
        ):
            reset_session_state()
            st.rerun()

    # ---------------- 4-Tab Architecture ----------------
    tab1, tab2, tab3, tab4 = st.tabs(
        [
            "📹 Live Classroom Monitor",
            "📊 Session Dynamics & Analytics",
            "🧮 Student Safe-Leave Simulator",
            "🧾 Timestamped Attendance & SHA-256 Audit Logs",
        ]
    )

    # Create Tab 1 placeholders first so Tabs 2-4 can render BEFORE any streaming loop
    with tab1:
        kpi_ph = st.empty()
        col_vid, col_side = st.columns([1.05, 1.0])
        with col_vid:
            cam_ph = st.empty()
            banner_ph = st.empty()
        with col_side:
            chart_ph = st.empty()
            st.markdown("#### 👥 Live Behavioral Roster")
            roster_ph = st.empty()

    # Populate Tabs 2, 3, and 4 immediately so tab navigation always has full content
    with tab2:
        render_tab2_analytics(dark_mode)
    with tab3:
        render_tab3_safe_leave_simulator(dark_mode)
    with tab4:
        render_tab4_audit_logs()

    # Helper to render Tab 1 snapshot (both idle and live updates)
    tracker: ClassroomTracker = st.session_state.tracker

    def sync_tab1_ui(
        rgb_frame: np.ndarray,
        tracks: List[TrackedParticipant],
        class_eng: float,
        audio_state: str,
        fps: float,
    ) -> None:
        present_count = sum(
            1 for t in tracker.retired_tracks.values() if t.marked_present
        )
        with kpi_ph.container():
            m1, m2, m3, m4, m5 = st.columns(5)
            m1.metric("Live Engagement", f"{class_eng:.1f}%")
            m2.metric("Peak Engagement", f"{st.session_state.peak_engagement:.1f}%")
            m3.metric("Participants In Frame", f"{len(tracks)}")
            m4.metric("Marked Present", f"{present_count}")
            m5.metric("Audio Activity & FPS", f"{audio_state.split('/')[0].strip()} | {fps:.1f}")

        cam_ph.image(rgb_frame, channels="RGB", width=FRAME_WIDTH)

        sugg = build_teaching_suggestion(
            active_tracks=tracks,
            class_engagement=class_eng,
            audio_state=audio_state,
            inactivity_threshold_sec=inactivity_threshold,
            dark_mode=dark_mode,
        )
        banner_ph.markdown(
            f"""
            <div class="suggestion-banner" style="background:{sugg['bg']}; border-left-color:{sugg['border']}; color:{sugg['fg']};">
                <div class="banner-title" style="color:{sugg['fg']};">{sugg['title']}</div>
                <div class="banner-body" style="color:{sugg['fg']};">{sugg['body']}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        chart_ph.altair_chart(
            build_engagement_chart(st.session_state.engagement_history, dark_mode),
            use_container_width=True,
        )
        roster_df = build_live_roster_df(tracks, presence_threshold)
        render_roster_table(roster_ph, roster_df, presence_threshold)

    # If camera is NOT running, render standby frame + current metrics and return
    if not st.session_state.camera_running:
        standby_rgb = make_standby_frame(
            dark_mode, "Click 'Start Camera Agent' to begin live monitoring"
        )
        sync_tab1_ui(
            rgb_frame=standby_rgb,
            tracks=list(tracker.tracks.values()),
            class_eng=st.session_state.last_class_engagement,
            audio_state=st.session_state.last_audio_state,
            fps=st.session_state.last_fps,
        )
        return

    # ---------------- Live Camera / Video Processing Loop ----------------
    detector = ThreeTierFaceDetector(prefer_mode=detector_pref)
    audio_mon: OfflineAudioMonitor = st.session_state.audio_monitor
    if audio_mode == "Live Microphone":
        audio_mon.start()
    else:
        audio_mon.stop()

    cap = open_video_source(
        source_mode=source_mode,
        webcam_index=webcam_idx,
        uploaded_path=st.session_state.uploaded_video_path,
    )
    if cap is None:
        st.session_state.camera_running = False
        err_msg = (
            "No uploaded video found. Upload an .mp4/.mov/.avi file in the sidebar."
            if source_mode != "Live Webcam"
            else f"Unable to open webcam index {webcam_idx}. Check macOS Camera permissions."
        )
        st.error(err_msg)
        standby_rgb = make_standby_frame(dark_mode, err_msg)
        sync_tab1_ui(standby_rgb, [], 0.0, "Silence / Passive", 0.0)
        return

    prev_frame_ts = time.time()
    last_ui_sync = 0.0
    last_chart_sample = 0.0
    smoothed_fps = 0.0

    try:
        while st.session_state.camera_running:
            ok, frame_bgr = cap.read()
            if not ok:
                if source_mode == "Upload Classroom Video (.mp4/.mov/.avi)":
                    # Loop uploaded classroom video cleanly or stop at end
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame_bgr = cap.read()
                    if not ok:
                        break
                else:
                    time.sleep(0.02)
                    continue

            now = time.time()
            dt = max(0.005, now - prev_frame_ts)
            prev_frame_ts = now
            inst_fps = 1.0 / dt
            smoothed_fps = (
                inst_fps if smoothed_fps == 0.0 else 0.85 * smoothed_fps + 0.15 * inst_fps
            )

            frame_bgr = cv2.resize(frame_bgr, (FRAME_WIDTH, FRAME_HEIGHT))
            audio_state, audio_score, _, _ = audio_mon.analyze(mode=audio_mode)
            detections = detector.detect(frame_bgr)

            active_tracks = tracker.step(
                detections=detections,
                frame_bgr=frame_bgr,
                dt=dt,
                presence_threshold_sec=presence_threshold,
                inactivity_threshold_sec=inactivity_threshold,
                audio_state=audio_state,
                audio_score=audio_score,
                weights=(w_pose, w_move, w_audio),
            )

            if active_tracks:
                class_eng = float(np.mean([t.engagement_score for t in active_tracks]))
            else:
                class_eng = 0.0

            st.session_state.last_class_engagement = class_eng
            st.session_state.last_audio_state = audio_state
            st.session_state.last_fps = smoothed_fps
            if class_eng > st.session_state.peak_engagement:
                st.session_state.peak_engagement = class_eng

            # Track attention drops (<55% when participants are present)
            if active_tracks and class_eng < 55.0:
                if not st.session_state.in_drop_state:
                    st.session_state.attention_drop_count += 1
                    st.session_state.in_drop_state = True
                    tracker.log_event(
                        "Attention Drop",
                        f"Class engagement dropped to {class_eng:.1f}% ({audio_state})",
                    )
            else:
                st.session_state.in_drop_state = False

            # Sample engagement trend chart once per second
            if now - last_chart_sample >= 1.0:
                last_chart_sample = now
                step_num = len(st.session_state.engagement_history) + 1
                st.session_state.engagement_history.append(
                    {
                        "Step": step_num,
                        "Time": datetime.datetime.now().strftime("%H:%M:%S"),
                        "Engagement": round(class_eng, 1),
                    }
                )
                if len(st.session_state.engagement_history) > 600:
                    st.session_state.engagement_history = st.session_state.engagement_history[
                        -600:
                    ]

            rgb_hud = render_hud_frame(
                frame_bgr=frame_bgr,
                tracks=active_tracks,
                presence_threshold_sec=presence_threshold,
                class_engagement=class_eng,
                audio_state=audio_state,
                fps=smoothed_fps,
                tier_label=detector.active_tier_label,
            )

            # Always update the live video viewport cleanly
            cam_ph.image(rgb_hud, channels="RGB", width=FRAME_WIDTH)

            # Sync metrics, suggestion banner, Altair chart & roster every 0.55s
            if now - last_ui_sync >= 0.55:
                last_ui_sync = now
                present_count = sum(
                    1 for t in tracker.retired_tracks.values() if t.marked_present
                )
                with kpi_ph.container():
                    m1, m2, m3, m4, m5 = st.columns(5)
                    m1.metric("Live Engagement", f"{class_eng:.1f}%")
                    m2.metric(
                        "Peak Engagement", f"{st.session_state.peak_engagement:.1f}%"
                    )
                    m3.metric("Participants In Frame", f"{len(active_tracks)}")
                    m4.metric("Marked Present", f"{present_count}")
                    m5.metric(
                        "Audio Activity & FPS",
                        f"{audio_state.split('/')[0].strip()} | {smoothed_fps:.1f}",
                    )

                sugg = build_teaching_suggestion(
                    active_tracks=active_tracks,
                    class_engagement=class_eng,
                    audio_state=audio_state,
                    inactivity_threshold_sec=inactivity_threshold,
                    dark_mode=dark_mode,
                )
                banner_ph.markdown(
                    f"""
                    <div class="suggestion-banner" style="background:{sugg['bg']}; border-left-color:{sugg['border']}; color:{sugg['fg']};">
                        <div class="banner-title" style="color:{sugg['fg']};">{sugg['title']}</div>
                        <div class="banner-body" style="color:{sugg['fg']};">{sugg['body']}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

                chart_ph.altair_chart(
                    build_engagement_chart(
                        st.session_state.engagement_history, dark_mode
                    ),
                    use_container_width=True,
                )
                roster_df = build_live_roster_df(active_tracks, presence_threshold)
                render_roster_table(roster_ph, roster_df, presence_threshold)

            time.sleep(0.015)
    finally:
        cap.release()
        audio_mon.stop()


if __name__ == "__main__":
    main()
