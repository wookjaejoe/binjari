import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 구역 사진은 포털이 준다(lib/registry.ts 의 PORTALS.host). next/image 를 거치게 해서
    // 브라우저가 포털을 직접 때리지 않고, 최적화본이 우리 쪽에 캐시되게 한다.
    remotePatterns: [
      { protocol: "https", hostname: "gwgs.pubcamping.kr", pathname: "/upload/**" },
      { protocol: "https", hostname: "reservation.knps.or.kr", pathname: "/cntnts/camp/**" },
    ],
  },
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
