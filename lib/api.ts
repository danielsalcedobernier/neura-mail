import { NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function created<T>(data: T) {
  return ok(data, 201)
}

export function error(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ success: false, error: message, details }, { status })
}

export function unauthorized() {
  return error('Unauthorized', 401)
}

export function forbidden() {
  return error('Forbidden', 403)
}

export function notFound(resource = 'Resource') {
  return error(`${resource} not found`, 404)
}

export function serverError(message = 'Internal server error') {
  return error(message, 500)
}

export function validationError(message: string, details?: unknown) {
  return error(message, 422, details)
}

export type ApiResponse<T> = {
  success: true
  data: T
} | {
  success: false
  error: string
  details?: unknown
}
