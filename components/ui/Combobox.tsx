'use client'
import { useState, useRef, useEffect } from 'react'
import LoadingSpinner from './LoadingSpinner'

export interface ComboboxItem {
  id: string
  label: string
}

interface ComboboxProps {
  items: ComboboxItem[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
}

const MAX_SHOWN = 150

export default function Combobox({
  items, value, onChange, placeholder = 'Type to search…', disabled, loading,
}: ComboboxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedItem = items.find(i => i.id === value)

  const filtered = query.trim()
    ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase().trim()))
    : items

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function handleFocus() {
    setOpen(true)
    setQuery('')
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange('')
  }

  function handleSelect(item: ComboboxItem) {
    onChange(item.id)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const displayValue = open ? query : (selectedItem?.label ?? '')

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder={loading ? 'Loading…' : placeholder}
          autoComplete="off"
          className={`w-full rounded-lg px-3 py-2 text-sm pr-8 border focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors ${
            disabled
              ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
              : value
              ? 'border-green-400 bg-green-50 text-slate-800 font-medium'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
        />
        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none"
          >
            ×
          </button>
        ) : loading ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <LoadingSpinner size="sm" />
          </span>
        ) : (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
            ▾
          </span>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-48 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner size="sm" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400 italic">
              {query ? `No matches for "${query}"` : 'No items available'}
            </p>
          ) : (
            <>
              <div className="max-h-60 overflow-y-auto">
                {filtered.slice(0, MAX_SHOWN).map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-slate-50 last:border-0 ${
                      item.id === value
                        ? 'bg-green-50 text-green-800 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {filtered.length > MAX_SHOWN && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    Showing {MAX_SHOWN} of {filtered.length.toLocaleString()} — type to narrow down
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
