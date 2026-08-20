"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"
import * as m from "motion/react-m"

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { MicrosoftSignInButton } from "@/components/microsoft-sign-in-button"

type SignInExperienceProps = {
  googleClientId: string
  microsoftConfigured: boolean
  denied: boolean
  authError: boolean
  signedOut: boolean
}

type AtomicOrbitProps = {
  className: string
  direction: 1 | -1
  duration: number
  reduceMotion: boolean | null
}

function AtomicOrbit({ className, direction, duration, reduceMotion }: AtomicOrbitProps) {
  const rotation = direction * 360
  const transition = { duration, ease: "linear" as const, repeat: Infinity }

  return (
    <div className={className}>
      <m.span
        className="login-depth__orbit-rotor"
        animate={reduceMotion ? undefined : { rotateZ: -rotation }}
        transition={transition}
      >
        <span className="login-depth__electron-anchor login-depth__electron-anchor--primary">
          <m.span
            className="login-depth__electron-counter"
            animate={reduceMotion ? undefined : { rotateZ: rotation }}
            transition={transition}
          >
            <span className="login-depth__electron-billboard">
              <span className="login-depth__electron" />
            </span>
          </m.span>
        </span>
        <span className="login-depth__electron-anchor login-depth__electron-anchor--secondary">
          <m.span
            className="login-depth__electron-counter"
            animate={reduceMotion ? undefined : { rotateZ: rotation }}
            transition={transition}
          >
            <span className="login-depth__electron-billboard">
              <span className="login-depth__electron" />
            </span>
          </m.span>
        </span>
      </m.span>
    </div>
  )
}

export function SignInExperience({
  googleClientId,
  microsoftConfigured,
  denied,
  authError,
  signedOut,
}: SignInExperienceProps) {
  const reduceMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 180, damping: 28, mass: 0.7 })
  const smoothY = useSpring(pointerY, { stiffness: 180, damping: 28, mass: 0.7 })
  const rotateY = useTransform(smoothX, [-1, 1], [-4, 4])
  const rotateX = useTransform(smoothY, [-1, 1], [4, -4])
  const [pointerDepthEnabled, setPointerDepthEnabled] = useState(false)
  const pointerBounds = useRef<DOMRect | null>(null)

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine)")
    const update = () => setPointerDepthEnabled(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const resetBounds = () => { pointerBounds.current = null }
    window.addEventListener("resize", resetBounds)
    return () => window.removeEventListener("resize", resetBounds)
  }, [])

  function cacheDepthBounds(event: React.PointerEvent<HTMLElement>) {
    if (!pointerDepthEnabled) return
    pointerBounds.current = event.currentTarget.getBoundingClientRect()
  }

  function updateDepth(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion || !pointerDepthEnabled) return
    const bounds = pointerBounds.current ?? event.currentTarget.getBoundingClientRect()
    pointerBounds.current = bounds
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2)
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 2)
  }

  function resetDepth() {
    pointerBounds.current = null
    pointerX.set(0)
    pointerY.set(0)
  }

  const notice = denied
    ? { key: "denied", role: "alert" as const, warning: true, text: "This account does not have access. Contact your administrator." }
    : authError
      ? { key: "error", role: "alert" as const, warning: true, text: "Sign-in could not be completed. Retry or contact your administrator." }
      : signedOut
        ? { key: "signed-out", role: "status" as const, warning: false, text: "You have signed out." }
        : null

  return (
    <main className="login-shell" onPointerEnter={cacheDepthBounds} onPointerMove={updateDepth} onPointerLeave={resetDepth}>
      <div className="login-stage">
        <div className="login-depth" aria-hidden="true">
          <m.div
            className="login-depth__scene"
            style={reduceMotion || !pointerDepthEnabled ? undefined : { rotateX, rotateY }}
          >
            <m.div
              className="login-depth__plasma login-depth__plasma--rear"
              animate={reduceMotion ? undefined : {
                opacity: [0.62, 0.9, 0.68],
                scaleX: [0.96, 1.045, 0.98],
                scaleY: [0.92, 1.08, 0.96],
              }}
              transition={{ duration: 7.8, ease: "easeInOut", repeat: Infinity }}
            />
            <AtomicOrbit className="login-depth__orbit login-depth__orbit--outer" direction={1} duration={30} reduceMotion={reduceMotion} />
            <AtomicOrbit className="login-depth__orbit login-depth__orbit--inner" direction={-1} duration={22} reduceMotion={reduceMotion} />
            <AtomicOrbit className="login-depth__orbit login-depth__orbit--polar" direction={1} duration={26} reduceMotion={reduceMotion} />
            <div className="login-depth__core" />
            <m.div
              className="login-depth__wordmark"
              initial={reduceMotion ? false : { opacity: 0, y: 10, z: 72, rotateX: -4 }}
              animate={{ opacity: 1, y: 0, z: 108, rotateX: 0 }}
              transition={{ duration: 0.72, delay: 0.08, ease: [0.2, 0.72, 0.2, 1] }}
            >
              <span>LAIDBACKHR.AI</span>
            </m.div>
            <m.div
              className="login-depth__plasma login-depth__plasma--front"
              animate={reduceMotion ? undefined : {
                opacity: [0.28, 0.52, 0.32],
                x: ["-2%", "2%", "-1%"],
                scaleX: [1.02, 0.96, 1.02],
              }}
              transition={{ duration: 6.4, ease: "easeInOut", repeat: Infinity }}
            />
          </m.div>
        </div>

        <m.section
          layout
          className="login-card"
          initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.2, 0.72, 0.2, 1] }}
        >
          <div className="login-card__identity">
            <div className="login-card__brand">LaidbackHR.ai</div>
            <div className="login-card__divider" />
          </div>
          <m.div layout className="login-card__content">
            <h1>Sign in</h1>
            <AnimatePresence initial={false} mode="popLayout">
              {notice && (
                <m.div
                  key={notice.key}
                  layout
                  role={notice.role}
                  aria-live={notice.role === "status" ? "polite" : undefined}
                  aria-atomic="true"
                  className={notice.warning ? "login-notice login-notice--warning" : "login-notice"}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                >
                  {notice.text}
                </m.div>
              )}
            </AnimatePresence>
          </m.div>

          <m.div layout className="login-card__providers">
            <GoogleSignInButton clientId={googleClientId} />
            {googleClientId && microsoftConfigured && <div className="login-provider-separator" aria-hidden="true">
              <span />
              <span>or</span>
              <span />
            </div>}
            <MicrosoftSignInButton configured={microsoftConfigured} />
          </m.div>
        </m.section>
      </div>
    </main>
  )
}
