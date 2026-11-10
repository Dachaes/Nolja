package com.example.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// Spring 설정과 의존성 주입이 정상인지 애플리케이션 컨텍스트를 실제로 띄워 확인합니다.
@SpringBootTest
class BackendApplicationTests {

	@Test
	// 본문이 비어 있어도 컨텍스트 생성 자체가 실패하면 이 테스트가 실패합니다.
	void contextLoads() {
	}

}
