package com.example.backend.config;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.allowed-origins=https://doran.example, https://preview.example"
)
class WebOriginTests {

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void preflightAllowsConfiguredOriginsAndRejectsOtherOrigins() throws Exception {
        for (String origin : new String[] {
            "https://doran.example",
            "https://preview.example",
            "https://other.example",
        }) {
            var request = HttpRequest.newBuilder(
                URI.create("http://localhost:" + port + "/api/rooms")
            )
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (origin.equals("https://other.example")) {
                assertEquals(403, response.statusCode());
                assertTrue(response.headers().firstValue("Access-Control-Allow-Origin").isEmpty());
            } else {
                assertEquals(200, response.statusCode());
                assertEquals(
                    origin,
                    response.headers().firstValue("Access-Control-Allow-Origin").orElseThrow()
                );
            }
        }
    }

    @Test
    void socketHandshakeAllowsConfiguredOriginAndRejectsOtherOrigins() throws Exception {
        var uri = URI.create("ws://localhost:" + port + "/ws/rooms/ABCDEF");
        var socket = client
            .newWebSocketBuilder()
            .header("Origin", "https://doran.example")
            .buildAsync(uri, new WebSocket.Listener() {})
            .get(3, TimeUnit.SECONDS);
        socket.abort();
        var error = assertThrows(java.util.concurrent.ExecutionException.class, () ->
            client
                .newWebSocketBuilder()
                .header("Origin", "https://other.example")
                .buildAsync(uri, new WebSocket.Listener() {})
                .get(3, TimeUnit.SECONDS)
        );
        var handshake = assertInstanceOf(
            java.net.http.WebSocketHandshakeException.class,
            error.getCause()
        );
        assertEquals(403, handshake.getResponse().statusCode());
    }
}
