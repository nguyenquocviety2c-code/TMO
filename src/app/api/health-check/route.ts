import { NextResponse } from 'next/server';
import packageJson from '@/../package.json';

/**
 * Response data cho health check endpoint.
 */
interface HealthCheckData {
  status: string;
  timestamp: string;
  version: string;
}

/**
 * API response chuẩn theo CONVENTIONS.md.
 */
interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Handler GET /api/health-check.
 * Trả về trạng thái hệ thống, thời gian hiện tại, và phiên bản ứng dụng.
 *
 * @returns {NextResponse} Response JSON chứa thông tin health check.
 */
export async function GET(): Promise<NextResponse<ApiResponse<HealthCheckData>>> {
  try {
    const data: HealthCheckData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: packageJson.version,
    };

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
