'use client'

import { useEffect } from 'react'

export function LandingEffects() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-animate]'))

    let io: IntersectionObserver | null = null
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('visible'))
    } else {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible')
              io?.unobserve(entry.target)
            }
          })
        },
        { threshold: 0.12 },
      )
      els.forEach((el) => io?.observe(el))
    }

    const nav = document.getElementById('navbar')
    // Barra de botones del celular (cta-movil.tsx): despues de la portada y
    // mientras no se vea el cierre, que ya tiene los mismos botones.
    const ctaMovil = document.getElementById('cta-movil')
    const hero = document.querySelector<HTMLElement>('[aria-labelledby="hero-heading"]')
    const cierre = document.getElementById('cta-final')
    const onScroll = () => {
      nav?.classList.toggle('scrolled', window.scrollY > 8)
      if (!ctaMovil) return
      const pasoPortada = hero ? hero.getBoundingClientRect().bottom < 120 : window.scrollY > 600
      const r = cierre?.getBoundingClientRect()
      const veCierre = !!r && r.top < window.innerHeight && r.bottom > 0
      ctaMovil.dataset.visible = String(pasoPortada && !veCierre)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      io?.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return null
}
