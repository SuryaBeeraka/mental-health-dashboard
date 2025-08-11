import React, { useState } from "react";
import "../styles.css";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError("");
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Please select a .txt file first");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      // IMPORTANT: must match FastAPI param name: file: UploadFile = File(...)
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:5000/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || `Server error (${res.status})`);
      }
      setResult(data);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message || "Failed to extract info.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <h2>Upload Patient Note</h2>

      <form onSubmit={handleUpload}>
        <input
          type="file"
          accept=".txt"
          onChange={handleFileChange}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Extracting..." : "Extract Information"}
        </button>
      </form>

      {error && (
        <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>
      )}

      {result && (
        <div className="extracted-info">
          <h3>Extracted Information</h3>

          <p><strong>Name:</strong> {result.name ?? "N/A"}</p>
          <p><strong>Age:</strong> {result.age ?? "N/A"}</p>

          <h4>Mental Illnesses</h4>
          <ul>
            {(result.mental_illnesses || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>

          <h4>Medications Taken</h4>
          <ul>
            {(result.medications_taken || []).map((m, i) => (
              <li key={i}>
                <b>{m.name}</b>
                {m.dose ? ` • ${m.dose}` : ""}
                {m.route ? ` • ${m.route}` : ""}
                {m.frequency ? ` • ${m.frequency}` : ""}
                {m.duration ? ` • ${m.duration}` : ""}
                {m.reason ? ` — ${m.reason}` : ""}
              </li>
            ))}
          </ul>

          <h4>Past History</h4>
          <p>{result.past_history || "—"}</p>

          <h4>Diagnoses</h4>
          <ul>
            {(result.diagnoses || []).map((d, i) => (
              <li key={i}>
                {d.label}
                {d.code ? ` (${d.code})` : ""}
                {d.priority ? ` • ${d.priority}` : ""}
              </li>
            ))}
          </ul>

          <details style={{ marginTop: 12 }}>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}