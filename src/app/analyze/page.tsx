import type { Metadata } from 'next'
import SwingAnalyzer from '@/components/SwingAnalyzer'

export const metadata: Metadata = {
  title: 'Analyse your swing — Middled',
}

export default function AnalyzePage() {
  return <SwingAnalyzer />
}
