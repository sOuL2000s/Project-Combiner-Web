import React, { useState, useEffect } from 'react'

const FUN_MESSAGES = [
  "Scanning project structure...",
  "Reading file contents...",
  "Applying filters and exclusions...",
  "Calculating file hashes...",
  "Detecting duplicates...",
  "Generating tree view...",
  "Polishing the output...",
  "Brewing coffee for the compiler...",
  "Optimizing for maximum readability...",
  "Almost there...",
  "Finalizing the combination..."
]

export default function ProcessingOverlay({ processing }) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!processing) {
      setProgress(0)
      setMsgIndex(0)
      return
    }

    const msgInterval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % FUN_MESSAGES.length)
    }, 2000)

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev
        return prev + Math.random() * 5
      })
    }, 300)

    return () => {
      clearInterval(msgInterval)
      clearInterval(progressInterval)
    }
  }, [processing])

  if (!processing) return null

  return (
    <div className="processing-overlay">
      <div className="processing-content">
        <div className="blender-container">
          <div className="blender">
            <div className="blender-body">
              <div className="swirl"></div>
              <div className="file-icon f1">JS</div>
              <div className="file-icon f2">RS</div>
              <div className="file-icon f3">{}</div>
              <div className="file-icon f4">#</div>
            </div>
            <div className="blender-base"></div>
          </div>
        </div>
        
        <h2>Combining Files...</h2>
        <p className="fun-msg">{FUN_MESSAGES[msgIndex]}</p>
        
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="progress-text">{Math.round(progress)}%</div>
      </div>
    </div>
  )
}
