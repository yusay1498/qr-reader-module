"use client";

import { useEffect, useRef, useState } from "react";
import { readBarcodes } from "zxing-wasm/reader";

export default function Page() {
  // カメラ映像を表示する <video> 要素への参照
  const videoRef = useRef<HTMLVideoElement>(null);
  // 映像フレームをキャプチャするための非表示 <canvas> 要素への参照
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // スキャナーの状態管理
  // "initializing": カメラ起動前、"running": スキャン中、
  // "paused": バックグラウンド停止中、"error": エラー発生時
  const [status, setStatus] = useState<
    "initializing" | "running" | "paused" | "error"
  >(() =>
    typeof document !== "undefined" && document.hidden
      ? "paused"
      : "initializing",
  );

  // バーコードの読取結果（テキストとフォーマット）
  const [result, setResult] = useState<{
    text: string;
    format: string;
  } | null>(null);
  // エラー時に表示するメッセージ
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // カメラストリームを保持する変数（クリーンアップ時に停止するために使用）
    let stream: MediaStream | null = null;
    // 定期スキャンのインターバルIDを保持する変数
    let intervalId: ReturnType<typeof setInterval> | undefined;

    // カメラとスキャンインターバルを停止してリソースを解放する
    const stopScanner = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
      // カメラストリームのすべてのトラックを停止する
      // これを行わないとカメラインジケーターが点灯したままになる
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    // カメラを起動してスキャンを開始する
    const startScanner = async () => {
      try {
        // User-Agent からモバイルデバイスかどうかを判定する
        const isMobile =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // カメラへのアクセスを要求する
        // モバイルの場合はアウトカメラ（environment）を優先、PC の場合はデフォルトカメラを使用
        stream = await navigator.mediaDevices.getUserMedia(
          isMobile
            ? { video: { facingMode: { ideal: "environment" } } }
            : { video: true },
        );

        // videoRef がマウント前に unmount されていた場合は処理を中断する
        if (document.hidden || !videoRef.current) {
          stopScanner();
          if (document.hidden) {
            setStatus("paused");
          }
          return;
        }

        // 取得したカメラストリームを <video> 要素にセットして再生する
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // カメラの起動完了後、状態を "running"（スキャン中）に更新する
        setStatus("running");

        // 300ms ごとにカメラ映像を解析してバーコードを検出するインターバルを開始する
        intervalId = setInterval(async () => {
          try {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            // video または canvas が取得できない場合はスキップする
            if (!video || !canvas) return;

            // 映像データがまだ準備できていない場合はスキップする
            // HAVE_CURRENT_DATA (2) 以上であれば現在フレームのデータが利用可能
            if (
              video.readyState <
              HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
              return;
            }

            // canvas の 2D 描画コンテキストを取得する
            const context = canvas.getContext("2d");

            if (!context) return;

            // canvas のサイズを映像の実解像度に合わせる（歪み防止のため）
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // 現在の映像フレームを canvas に描画する
            context.drawImage(
              video,
              0,
              0,
              canvas.width,
              canvas.height,
            );

            // canvas から RGBA ピクセルデータ（ImageData）を取得する
            // このデータを zxing-wasm に渡してバーコードを解析する
            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );

            // zxing-wasm の readBarcodes でバーコードを解析する
            // formats: [] はすべての対応フォーマットを対象とする
            // maxNumberOfSymbols: 最大1件取得、tryHarder: 精度優先モード
            const results = await readBarcodes(imageData, {
              formats: [],
              maxNumberOfSymbols: 1,
              tryHarder: true,
            });

            // バーコードが検出された場合、最初の結果を state にセットする
            // 同じ値の場合は state 更新をスキップして無駄な再レンダーを防ぐ
            if (results.length > 0) {
              const { text, format } = results[0];
              setResult((current) =>
                current?.text === text && current?.format === format
                  ? current
                  : { text, format },
              );
            }
          } catch (error) {
            // スキャン中にエラーが発生した場合の処理
            console.error(error);
            stopScanner();
            setStatus("error");
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "バーコードの読取中にエラーが発生しました",
            );
          }
        }, 300);
      } catch (error) {
        // カメラへのアクセス許可拒否やデバイス未検出など、起動時エラーの処理
        console.error(error);
        stopScanner();
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "カメラの起動に失敗しました",
        );
      }
    };

    // 初期表示時の可視状態に合わせてスキャナーを制御する
    if (!document.hidden) {
      startScanner();
    }

    // Page Visibility API を使用してバックグラウンド時にカメラを停止し省エネを図る
    // タブが非表示になったときはカメラを停止、表示時に再起動する
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopScanner();
        setStatus("paused");
      } else {
        stopScanner();
        setStatus("initializing");
        startScanner();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // コンポーネントのアンマウント時（ページ離脱時）にリソースを解放するクリーンアップ関数
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopScanner();
    };
  }, []); // マウント時に一度だけ実行する

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold">ZXing WASM Barcode Reader</h1>
        <p className="mt-2 text-sm text-gray-500">
          Next.js + zxing-wasm 動作検証（QRコード・バーコード対応）
        </p>
      </header>

      {/* カメラ映像の表示エリア */}
      <section className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="QRコード・バーコードスキャン用のカメラ映像"
          className="aspect-video w-full bg-black object-cover"
        />
      </section>

      {/* バーコード解析用の非表示 canvas（映像フレームのキャプチャに使用） */}
      <canvas ref={canvasRef} className="hidden" />

      {/* スキャナーの現在の状態を表示するセクション */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">状態</h2>

        <p>
          {status === "initializing" && "初期化中"}
          {status === "running" && "スキャン中"}
          {status === "paused" && "一時停止中（バックグラウンド）"}
          {status === "error" && "エラー"}
        </p>

        {/* エラーメッセージがある場合のみ表示する */}
        {errorMessage && (
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        )}
      </section>

      {/* バーコードの読取結果を表示するセクション */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">読取結果</h2>

        {result ? (
          <>
            {/* 検出されたバーコードのフォーマット名を表示する */}
            <p className="mb-1 text-xs text-gray-500">
              フォーマット: {result.format}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-sm">
              {result.text}
            </pre>
          </>
        ) : (
          /* 結果がない場合は "未検出" を表示する */
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-sm">
            未検出
          </pre>
        )}
      </section>
    </main>
  );
}
