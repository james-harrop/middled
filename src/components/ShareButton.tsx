'use client'

import { useState } from 'react'

export default function ShareButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn-ghost"
      onClick={async () => {
        const url = window.location.href
        if (navigator.share) {
          await navigator.share({ title: 'My swing report — Middled', url }).catch(() => {})
        } else {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
      }}
    >
      {copied ? 'Link copied' : 'Share this report'}
    </button>
  )
}
