import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost 외의 호스트명으로 dev 서버에 붙으면 Next 가 _next/hmr 을 막는다.
  // 다른 기기(폰·노트북)에서 확인하려면 그 호스트를 여기 적어야 한다.
  allowedDevOrigins: [
    "maxio",
    "maxio.taild257d.ts.net",
    "100.118.124.19",
    "192.168.0.170",
  ],
};

export default nextConfig;
