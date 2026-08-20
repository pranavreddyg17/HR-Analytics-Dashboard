"use client"

import { useEffect, useState } from "react"
import {
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"
import * as m from "motion/react-m"

import { cn } from "@/lib/utils"
import styles from "@/components/motion/portal-atmosphere.module.css"

type PortalAtmosphereProps = {
  className?: string
  intensity?: number
  respondToScroll?: boolean
}

const POINTER_QUERY = "(hover: hover) and (pointer: fine)"

function useFinePointer() {
  const [hasFinePointer, setHasFinePointer] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(POINTER_QUERY)
    const update = () => setHasFinePointer(mediaQuery.matches)

    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return hasFinePointer
}

function ScrollAtmosphereLayer({ intensity }: { intensity: number }) {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -18 * intensity])
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.34, 0.46, 0.46, 0.34])

  return (
    <m.div
      className={styles.scrollLayer}
      style={{ y, opacity }}
    />
  )
}

export function PortalAtmosphere({
  className,
  intensity = 1,
  respondToScroll = false,
}: PortalAtmosphereProps) {
  const reduceMotion = useReducedMotion()
  const hasFinePointer = useFinePointer()
  const safeIntensity = Math.min(Math.max(intensity, 0), 2)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 70, damping: 30, mass: 0.9 })
  const smoothY = useSpring(pointerY, { stiffness: 70, damping: 30, mass: 0.9 })
  const farX = useTransform(smoothX, [-1, 1], [-5 * safeIntensity, 5 * safeIntensity])
  const farY = useTransform(smoothY, [-1, 1], [-4 * safeIntensity, 4 * safeIntensity])
  const nearX = useTransform(smoothX, [-1, 1], [-11 * safeIntensity, 11 * safeIntensity])
  const nearY = useTransform(smoothY, [-1, 1], [-8 * safeIntensity, 8 * safeIntensity])
  const meshRotateX = useTransform(smoothY, [-1, 1], [61 + 2 * safeIntensity, 61 - 2 * safeIntensity])
  const meshRotateY = useTransform(smoothX, [-1, 1], [-3 * safeIntensity, 3 * safeIntensity])
  const arcRotateX = useTransform(smoothY, [-1, 1], [68 + 2 * safeIntensity, 68 - 2 * safeIntensity])

  useEffect(() => {
    if (reduceMotion || !hasFinePointer || safeIntensity === 0) {
      pointerX.set(0)
      pointerY.set(0)
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointerX.set((event.clientX / window.innerWidth - 0.5) * 2)
      pointerY.set((event.clientY / window.innerHeight - 0.5) * 2)
    }

    const resetPointer = () => {
      pointerX.set(0)
      pointerY.set(0)
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("blur", resetPointer)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("blur", resetPointer)
    }
  }, [hasFinePointer, pointerX, pointerY, reduceMotion, safeIntensity])

  return (
    <div
      aria-hidden="true"
      className={cn("portal-atmosphere", styles.root, className)}
      style={{ inset: 0, overflow: "hidden", pointerEvents: "none", position: "absolute" }}
    >
      <m.div
        className={styles.starField}
        style={reduceMotion ? undefined : { x: farX, y: farY }}
      />
      <m.div
        className={cn(styles.nebula, styles.farNebula)}
        style={reduceMotion ? undefined : { x: farX, y: farY }}
      />
      <m.div
        className={cn(styles.nebula, styles.nearNebula)}
        style={reduceMotion ? undefined : { x: nearX, y: nearY }}
      />
      <m.div
        className={styles.mesh}
        style={reduceMotion ? undefined : { rotateX: meshRotateX, rotateY: meshRotateY, rotateZ: -12, x: farX, y: farY }}
      />
      <m.div
        className={styles.orbit}
        style={reduceMotion ? undefined : { x: nearX, y: nearY, rotateX: arcRotateX, rotateY: meshRotateY, rotateZ: 24 }}
      />
      <m.div
        className={styles.horizon}
        style={reduceMotion ? undefined : { x: farX, y: farY }}
      />
      {respondToScroll && !reduceMotion && <ScrollAtmosphereLayer intensity={safeIntensity} />}
    </div>
  )
}
