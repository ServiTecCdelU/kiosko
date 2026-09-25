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
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      io?.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return null
}
