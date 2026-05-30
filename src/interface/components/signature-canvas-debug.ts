/** Filter browser console with: signature-pad */
const TAG = "[signature-pad]";

export function sigLog(message: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const debug =
    process.env.NODE_ENV === "development" ||
    window.localStorage.getItem("debugSignaturePad") === "1";
  if (!debug) return;
  if (data) {
    console.log(TAG, message, data);
  } else {
    console.log(TAG, message);
  }
}

export function sigWarn(message: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const debug =
    process.env.NODE_ENV === "development" ||
    window.localStorage.getItem("debugSignaturePad") === "1";
  if (!debug) return;
  if (data) {
    console.warn(TAG, message, data);
  } else {
    console.warn(TAG, message);
  }
}
