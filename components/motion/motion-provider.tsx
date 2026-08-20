"use client"

import { LazyMotion, MotionConfig } from "motion/react"

const loadMotionFeatures = () => import("@/components/motion/motion-features").then((module) => module.default)

export function AppMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.2, 0.72, 0.2, 1] }}>
      <LazyMotion features={loadMotionFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  )
}
