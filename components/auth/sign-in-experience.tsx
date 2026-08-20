"use client"

import { useEffect, useState } from "react"
import { useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"
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

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine)")
    const update = () => setPointerDepthEnabled(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  function updateDepth(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion || !pointerDepthEnabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2)
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 2)
  }

  function resetDepth() {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <main className="login-shell" onPointerMove={updateDepth} onPointerLeave={resetDepth}>
      <div className="login-stage">
        <div className="login-depth" aria-hidden="true">
          <m.div
            className="login-depth__scene"
            style={reduceMotion || !pointerDepthEnabled ? undefined : { rotateX, rotateY }}
          >
            <m.div
              className="login-depth__orbit login-depth__orbit--outer"
              animate={reduceMotion ? undefined : { rotateZ: 360 }}
              transition={{ duration: 34, ease: "linear", repeat: Infinity }}
            />
            <m.div
              className="login-depth__orbit login-depth__orbit--inner"
              animate={reduceMotion ? undefined : { rotateZ: -360 }}
              transition={{ duration: 24, ease: "linear", repeat: Infinity }}
            />
            <div className="login-depth__core" />
            <div className="login-depth__plane login-depth__plane--one" />
            <div className="login-depth__plane login-depth__plane--two" />
            <div className="login-depth__plane login-depth__plane--three" />
          </m.div>
        </div>

        <m.section
          className="login-card"
          initial={false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.2, 0.72, 0.2, 1] }}
        >
          <div className="login-card__brand">LaidbackHR.ai</div>
          <div className="login-card__divider" />
          <h1>Sign in</h1>

          {signedOut && (
            <m.div role="status" className="login-notice" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              You have signed out.
            </m.div>
          )}
          {denied && (
            <m.div role="alert" className="login-notice login-notice--warning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              This account does not have access. Contact your administrator.
            </m.div>
          )}
          {authError && (
            <m.div role="alert" className="login-notice login-notice--warning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Sign-in could not be completed. Retry or contact your administrator.
            </m.div>
          )}

          <div className="login-card__providers">
            <GoogleSignInButton clientId={googleClientId} />
            <div className="login-provider-separator" aria-hidden="true">
              <span />
              <span>or</span>
              <span />
            </div>
            <MicrosoftSignInButton configured={microsoftConfigured} />
          </div>
        </m.section>
      </div>
    </main>
  )
}
