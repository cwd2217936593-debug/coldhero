import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { listZones } from "@/api/sensors";
import { submitFaultReport, uploadFaultImages } from "@/api/fault";
import { errMessage } from "@/api/client";
import { FAULT_TYPES } from "@/api/types";
import type { FaultImage, FaultReport, FaultSeverity, Zone } from "@/api/types";

interface Props {
  onCreated: (r: FaultReport) => void;
  onCancel: () => void;
}

const SEVERITIES: { value: FaultSeverity; label: string }[] = [
  { value: "low", label: "一般" },
  { value: "medium", label: "中等" },
  { value: "high", label: "较重" },
  { value: "critical", label: "严重" },
];

export default function FaultSubmitForm({ onCreated, onCancel }: Props) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<number | "">("");
  const [faultType, setFaultType] = useState<string>("制冷");
  const [severity, setSeverity] = useState<FaultSeverity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadedImages, setUploadedImages] = useState<FaultImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listZones().then(setZones).catch(() => {});
  }, []);

  async function handleUpload(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => /^image\//.test(f.type));
    if (!arr.length) return;
    setError(null);
    setPendingFiles((prev) => [...prev, ...arr]);
    setUploading(true);
    try {
      const out = await uploadFaultImages(arr);
      setUploadedImages((prev) => [...prev, ...out]);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setUploading(false);
      setPendingFiles([]);
    }
  }

  function removeImage(key: string) {
    setUploadedImages((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleSubmit() {
    setError(null);
    if (title.trim().length < 2) return setError("标题至少 2 个字符");
    if (description.trim().length < 5) return setError("描述至少 5 个字符");
    setSubmitting(true);
    try {
      const r = await submitFaultReport({
        zoneId: zoneId === "" ? null : Number(zoneId),
        faultType,
        title: title.trim(),
        description: description.trim(),
        imageUrls: uploadedImages,
        severity,
      });
      onCreated(r);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800">提交故障报告</h3>
        <button className="text-sm text-slate-500 hover:text-slate-700" onClick={onCancel}>取消</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="所属库区">
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full border-slate-300 rounded-md text-sm"
          >
            <option value="">未选择</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.code} · {z.name}</option>
            ))}
          </select>
        </Field>
        <Field label="故障类型">
          <select
            value={faultType}
            onChange={(e) => setFaultType(e.target.value)}
            className="w-full border-slate-300 rounded-md text-sm"
          >
            {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="紧迫程度（自评）">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as FaultSeverity)}
            className="w-full border-slate-300 rounded-md text-sm"
          >
            {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="标题" className="mt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如：A 区压缩机异响并伴有温度上升"
          className="w-full border-slate-300 rounded-md text-sm"
        />
      </Field>

      <Field label="详细描述" className="mt-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="请尽量描述：现象、发生时间、是否伴随告警、已尝试的处理动作、库内货物状态等"
          className="w-full border-slate-300 rounded-md text-sm"
        />
      </Field>

      <Field label="现场照片（最多 8 张，单张 ≤ 10MB）" className="mt-3">
        <div
          ref={dropRef}
          onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add("ring-2", "ring-brand-400"); }}
          onDragLeave={() => dropRef.current?.classList.remove("ring-2", "ring-brand-400")}
          onDrop={(e) => {
            e.preventDefault();
            dropRef.current?.classList.remove("ring-2", "ring-brand-400");
            void handleUpload(e.dataTransfer.files);
          }}
          className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:bg-slate-50 transition cursor-pointer"
          onClick={() => document.getElementById("fault-file-input")?.click()}
        >
          <div className="text-sm text-slate-600 text-center">
            拖拽图片到此处，或<span className="text-brand-600">点击选择</span>
          </div>
          <input
            id="fault-file-input"
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>

        {(uploading || pendingFiles.length > 0 || uploadedImages.length > 0) && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {pendingFiles.map((f, i) => (
              <div key={`p${i}`} className="aspect-square rounded-md bg-slate-100 grid place-items-center text-xs text-slate-500">
                上传中…
              </div>
            ))}
            {uploadedImages.map((img) => (
              <div key={img.key} className="relative aspect-square rounded-md overflow-hidden border border-slate-200">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(img.key)}
                  className="absolute top-1 right-1 bg-black/55 hover:bg-black/75 text-white text-[10px] rounded px-1.5 py-0.5"
                >移除</button>
              </div>
            ))}
          </div>
        )}
      </Field>

      {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
        >取消</button>
        <button
          onClick={handleSubmit}
          disabled={submitting || uploading}
          className={clsx(
            "px-4 py-2 text-sm rounded-md text-white",
            submitting || uploading ? "bg-slate-400 cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700",
          )}
        >
          {submitting ? "提交中…" : "提交并触发 AI 分析"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
