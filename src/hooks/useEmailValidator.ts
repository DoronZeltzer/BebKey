import { useState, useRef } from 'react'

export type EmailStatus = 'idle' | 'checking' | 'valid' | 'invalid'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function useEmailValidator() {
  const [status, setStatus] = useState<EmailStatus>('idle')
  const [message, setMessage] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function validate(email: string) {
    // Reset if empty
    if (!email) {
      setStatus('idle')
      setMessage('')
      return
    }

    // Instant format check
    if (!EMAIL_REGEX.test(email)) {
      setStatus('invalid')
      setMessage('Invalid email format')
      return
    }

    // Format looks good - debounce the API call
    setStatus('checking')
    setMessage('Checking...')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const apiKey = import.meta.env.VITE_ABSTRACT_EMAIL_KEY

      // No API key - just trust the format
      if (!apiKey) {
        setStatus('valid')
        setMessage('Email looks good')
        return
      }

      try {
        const res = await fetch(
          `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`
        )
        const data = await res.json()

        if (data.deliverability === 'DELIVERABLE') {
          setStatus('valid')
          setMessage('Email verified ✓')
        } else if (data.is_disposable_email?.value) {
          setStatus('invalid')
          setMessage('Disposable emails not allowed')
        } else if (data.deliverability === 'UNDELIVERABLE') {
          setStatus('invalid')
          setMessage('This email does not exist')
        } else {
          // RISKY or UNKNOWN - accept but warn
          setStatus('valid')
          setMessage('Email accepted')
        }
      } catch {
        // API failed - fall back to format-only
        setStatus('valid')
        setMessage('Email looks good')
      }
    }, 600)
  }

  return { status, message, validate }
}
