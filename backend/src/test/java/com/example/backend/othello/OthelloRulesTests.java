package com.example.backend.othello;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Arrays;
import java.util.Random;
import org.junit.jupiter.api.Test;

// Spring 서버 없이 순수 규칙 엔진만 검사합니다. 각 상황은 최소한의 보드를 직접 만들어 재현합니다.
class OthelloRulesTests {
    @Test
    // 중심의 8방향을 모두 뒤집으면서도 입력 보드는 수정하지 않는지 확인합니다.
    void allEightDirectionsFlipWithoutMutatingOriginal() {
        String[][] board = new String[8][8];
        for (int dr = -1; dr <= 1; dr++) for (int dc = -1; dc <= 1; dc++) {
            if (dr == 0 && dc == 0) continue;
            board[3 + dr][3 + dc] = "white";
            board[3 + 2 * dr][3 + 2 * dc] = "black";
        }
        var game = new GameState(board, "black", "playing", null, null, 0);
        assertEquals(8, OthelloRules.flips(board, "black", 3, 3).size());
        var next = OthelloRules.play(game, 3, 3);
        assertEquals("white", board[2][2]);
        assertEquals("black", next.board()[2][2]);
        assertEquals("finished", next.status());
    }

    @Test
    // 상대 자동 패스와 빈칸이 남는 조기 종료를 각각 준비한 보드로 검증합니다.
    void passAndEarlyFinishAreHandled() {
        String[][] board = new String[8][8];
        for (var row : board) Arrays.fill(row, "black");
        board[0][1] = board[7][6] = "white";
        board[0][2] = board[7][7] = null;
        var next = OthelloRules.play(new GameState(board, "black", "playing", null, null, 0), 0, 2);
        assertEquals("white", next.passedPlayer());
        assertEquals("black", next.currentTurn());
        assertEquals("finished", OthelloRules.play(next, 7, 7).status());
        board[7][6] = "black";
        var early = OthelloRules.play(new GameState(board, "black", "playing", null, null, 0), 0, 2);
        assertEquals("finished", early.status());
        assertNull(early.board()[7][7]);
        assertThrows(IllegalArgumentException.class, () -> OthelloRules.play(early, 7, 7));
    }

    @Test
    // 고정 seed의 100판으로 다양한 수순을 반복 검사합니다. 같은 seed로 실패 수순을 재현할 수 있습니다.
    void hundredCompleteGamesTerminateWithValidCounts() {
        for (int seed = 0; seed < 100; seed++) {
            var random = new Random(seed);
            var game = OthelloRules.initial();
            while ("playing".equals(game.status())) {
                assertTrue(game.moveCount() < 60);
                var moves = new java.util.ArrayList<GameState.Position>();
                for (int row = 0; row < 8; row++) for (int col = 0; col < 8; col++) {
                    if (!OthelloRules.flips(game.board(), game.currentTurn(), row, col).isEmpty()) moves.add(new GameState.Position(row, col));
                }
                assertFalse(moves.isEmpty());
                var move = moves.get(random.nextInt(moves.size()));
                game = OthelloRules.play(game, move.row(), move.col());
                // 한 번 둘 때 전체 돌은 정확히 하나 증가합니다. 뒤집기는 색상만 바꾸므로 개수를 늘리지 않습니다.
                assertEquals(game.moveCount() + 4, Arrays.stream(game.board()).flatMap(Arrays::stream).filter(cell -> cell != null).count());
            }
            assertNull(game.currentTurn());
            assertFalse(OthelloRules.canPlay(game.board(), "black"));
            assertFalse(OthelloRules.canPlay(game.board(), "white"));
        }
    }
}
