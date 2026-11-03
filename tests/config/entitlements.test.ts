import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const REQUIRED = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.device.audio-input',
  'com.apple.security.device.camera'
]

const readPlist = (file: string): Record<string, unknown> =>
  JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }))

describe.each(['build/entitlements.mac.plist', 'build/entitlements.mac.inherit.plist'])(
  'entitlements %s',
  (file) => {
    test('given the plist, when parsed, then every required entitlement is true', () => {
      const plist = readPlist(file)
      for (const key of REQUIRED) expect(plist[key], key).toBe(true)
    })
  }
)

describe('electron-builder config', () => {
  test('given the repo, when looking for builder config, then only electron-builder.json exists', () => {
    expect(existsSync('electron-builder.yml')).toBe(false)
    expect(existsSync('electron-builder.json')).toBe(true)
  })

  test('given electron-builder.json, when read, then it is an ad-hoc arm64 dir build with device usage strings', () => {
    const cfg = JSON.parse(readFileSync('electron-builder.json', 'utf8'))
    expect(cfg.productName).toBe('Mock Case Proctor')
    expect(cfg.mac.identity).toBe('-')
    expect(cfg.mac.hardenedRuntime).toBe(true)
    expect(cfg.mac.entitlements).toBe('build/entitlements.mac.plist')
    expect(cfg.mac.entitlementsInherit).toBe('build/entitlements.mac.inherit.plist')
    expect(cfg.mac.target).toEqual([{ target: 'dir', arch: ['arm64'] }])
    expect(cfg.mac.extendInfo.NSMicrophoneUsageDescription).toBeTruthy()
    expect(cfg.mac.extendInfo.NSCameraUsageDescription).toBeTruthy()
    expect(cfg.asarUnpack).toContain('**/*.node')
    expect(cfg.electronFuses?.enableNodeCliInspectArguments).not.toBe(false)
  })
})
