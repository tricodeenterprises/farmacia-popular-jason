import { useRef, useState, useCallback } from "react";

/**
 * Hook that acquires camera stream directly in a click handler
 * to preserve the user gesture context (required by Safari/iOS).
 * Returns the stream and open/close helpers.
 */
export function useCameraStream() {
  const [showCamera, setShowCamera] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const openCamera = useCallback(async () => {
    try {
      // CRITICAL: getUserMedia called directly in click handler
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setShowCamera(true);
    } catch (err) {
      console.error("Camera access error:", err);
      // Still open the component so it can show the error message
      streamRef.current = null;
      setShowCamera(true);
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  return { showCamera, stream: streamRef.current, openCamera, closeCamera, streamRef };
}
