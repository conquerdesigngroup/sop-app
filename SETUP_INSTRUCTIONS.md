# SOP App - Quick Setup Instructions

Your new React TypeScript app is ready! Follow these quick steps to complete setup:

## ✅ Already Done:
- ✅ React TypeScript app created
- ✅ React Router DOM installed
- ✅ Folder structure created (pages, components, contexts)
- ✅ types.ts created
- ✅ theme.ts created

## 📋 Manual Steps Needed:

### 1. Copy SOP Files

From: `C:\Users\tzupp\OneDrive\Desktop\claude-apps\web-scraper\equipment-checklist\src\`

Copy these files:
- `pages/SOPPage.tsx` → `sop-app/src/pages/`
- `components/SOPForm.tsx` → `sop-app/src/components/`
- `components/IconSelector.tsx` → `sop-app/src/components/`
- `contexts/SOPContext.tsx` → `sop-app/src/contexts/`
- `components/SOPViewer.tsx` → `sop-app/src/components/` (if it exists)

### 2. Modify SOPPage.tsx

Open `sop-app/src/pages/SOPPage.tsx` and:

**Remove** these lines (around line 3 and 12):
```typescript
import { useAuth } from '../contexts/AuthContext';
const { user } = useAuth();
```

**Remove or comment out** SOPViewer reference if you don't have that file (lines 7, 99)

### 3. Modify SOPForm.tsx

Open `sop-app/src/components/SOPForm.tsx` and:

**Remove** line that imports useAuth:
```typescript
import { useAuth } from '../contexts/AuthContext';
```

**Remove** line that uses it:
```typescript
const { user } = useAuth();
```

**Change** line 131 to:
```typescript
createdBy: 'user',  // or any default value
```

### 4. Update App.tsx

Replace `sop-app/src/App.tsx` content with:

```typescript
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SOPProvider } from './contexts/SOPContext';
import SOPPage from './pages/SOPPage';
import './App.css';

function App() {
  return (
    <SOPProvider>
      <Router>
        <div className="App" style={{ backgroundColor: '#000000', minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/sop" replace />} />
            <Route path="/sop" element={<SOPPage />} />
          </Routes>
        </div>
      </Router>
    </SOPProvider>
  );
}

export default App;
```

### 5. Update index.css

Replace `sop-app/src/index.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #000000;
  color: #FFFFFF;
}

code {
  font-family: 'Roboto Mono', 'Courier New', monospace;
}
```

### 6. Start the App

```bash
cd C:\Users\tzupp\OneDrive\Desktop\claude-apps\sop-app
npm start
```

Your app will open at http://localhost:3001 (or 3002 if 3000/3001 are taken)

## 🎉 You're Done!

Navigate to the app and you should see your SOP page ready to use!

## ⚠️ If You Get Errors:

1. **"Cannot find module"** - Make sure all files are copied correctly
2. **"useAuth is not defined"** - Remove the useAuth import and usage as described in steps 2 & 3
3. **Port already in use** - The app will automatically try the next available port

## 🔧 Need Help?

Check the README.md in the SOP_FILES folder for detailed explanations!
