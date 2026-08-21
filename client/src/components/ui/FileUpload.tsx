import { useRef, useState, DragEvent } from 'react';
import { Upload, X, Image } from 'lucide-react';

interface FileUploadProps {
  label?: string;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  files: File[];
  onChange: (files: File[]) => void;
  previews?: string[];
}

export default function FileUpload({
  label,
  accept = 'image/*',
  multiple = true,
  maxFiles = 5,
  files,
  onChange,
  previews = [],
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles);
    const combined = [...files, ...arr].slice(0, maxFiles);
    onChange(combined);
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      {label && (
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-2">{label}</p>
      )}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
          dragActive ? 'border-[#2563EB] bg-blue-50/30' : 'border-gray-200 hover:border-gray-300 bg-[#f6f3f2]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={24} className="mx-auto text-[#8f6f6c] mb-2" />
        <p className="text-xs font-semibold text-[#5f5e5e]">Drop files here or click to browse</p>
        <p className="text-[10px] text-[#8f6f6c] mt-1">Max {maxFiles} files</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Preview grid */}
      {(files.length > 0 || previews.length > 0) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
          {previews.map((url, i) => (
            <div key={`prev-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {files.map((file, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              {file.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Image size={24} className="text-gray-400" />
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
