import React, { useRef, useState } from 'react';
import { theme } from '../theme';

interface ImageUploadProps {
  value?: string;
  onChange: (imageUrl: string) => void;
  label?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, label }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState(value || '');
  const [isUrlMode, setIsUrlMode] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsUploading(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target?.result as string;
        onChange(base64String);
        setIsUploading(false);
      };
      reader.onerror = () => {
        alert('Error reading file');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert('Error uploading file');
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
    }
  };

  const handleRemove = () => {
    onChange('');
    setUrlInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}

      <div style={styles.modeToggle}>
        <button
          type="button"
          onClick={() => setIsUrlMode(true)}
          style={{
            ...styles.modeButton,
            ...(isUrlMode ? styles.modeButtonActive : {}),
          }}
        >
          📎 URL
        </button>
        <button
          type="button"
          onClick={() => setIsUrlMode(false)}
          style={{
            ...styles.modeButton,
            ...(!isUrlMode ? styles.modeButtonActive : {}),
          }}
        >
          📁 Upload File
        </button>
      </div>

      {isUrlMode ? (
        <div style={styles.urlContainer}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onBlur={handleUrlSubmit}
            placeholder="https://example.com/image.jpg or paste image URL"
            style={styles.input}
          />
          {urlInput && (
            <button
              type="button"
              onClick={handleUrlSubmit}
              style={styles.applyButton}
            >
              Apply
            </button>
          )}
        </div>
      ) : (
        <div style={styles.uploadContainer}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={styles.fileInput}
            id="file-upload"
          />
          <label htmlFor="file-upload" style={styles.uploadButton}>
            {isUploading ? 'Uploading...' : '📤 Choose Image'}
          </label>
          <span style={styles.uploadHint}>Max 5MB • JPG, PNG, GIF, WebP</span>
        </div>
      )}

      {value && (
        <div style={styles.previewContainer}>
          <img src={value} alt="Preview" style={styles.preview} onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }} />
          <button
            type="button"
            onClick={handleRemove}
            style={styles.removeButton}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Remove Image
          </button>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  modeToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
  },
  modeButton: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modeButtonActive: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    borderColor: theme.colors.primary,
  },
  urlContainer: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  applyButton: {
    padding: '12px 20px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  uploadContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'flex-start',
  },
  fileInput: {
    display: 'none',
  },
  uploadButton: {
    padding: '12px 24px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  uploadHint: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  previewContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '8px',
  },
  preview: {
    maxWidth: '100%',
    maxHeight: '300px',
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.border}`,
    objectFit: 'contain',
  },
  removeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: theme.colors.error,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
};

export default ImageUpload;
