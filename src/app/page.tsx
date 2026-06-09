"use client";

import { useEffect, useRef, useState } from "react";
import { readBarcodes } from "zxing-wasm/reader";

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState<
    "initializing" | "running" | "error"
  >("initializing");

  const [result, setResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const startScanner = async () => {
      try {
        const isMobile =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        stream = await navigator.mediaDevices.getUserMedia(
          isMobile
            ? {
                video: {
                  facingMode: {
                    ideal: "environment",
                  },
                },
              }
            : {
                video: true,
              },
        );

        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setStatus("running");

        intervalId = setInterval(async () => {
          try {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (!video || !canvas) return;

            if (
              video.readyState <
              HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
              return;
            }

            const context = canvas.getContext("2d");

            if (!context) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            context.drawImage(
              video,
              0,
              0,
              canvas.width,
              canvas.height,
            );

            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );

            const results = await readBarcodes(imageData, {
              formats: ["QRCode"],
              maxNumberOfSymbols: 1,
              tryHarder: true,
            });

            if (results.length > 0) {
              const value = results[0].text;

              setResult((current) =>
                current === value ? current : value,
              );
            }
          } catch (error) {
            console.error(error);
            setStatus("error");

            if (error instanceof Error) {
              setErrorMessage(error.message);
            } else {
              setErrorMessage("QRコードの読取中にエラーが発生しました");
            }

            if (intervalId) {
              clearInterval(intervalId);
              intervalId = undefined;
            }
          }
        }, 300);
      } catch (error) {
        console.error(error);

        setStatus("error");

        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("カメラの起動に失敗しました");
        }
      }
    };

    startScanner();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }

      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold">
          ZXing WASM QR Reader
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Next.js + zxing-wasm 動作検証
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="QRコードスキャン用のカメラ映像"
          className="aspect-video w-full bg-black object-cover"
        />
      </section>

      <canvas
        ref={canvasRef}
        className="hidden"
      />

      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">状態</h2>

        <p>
          {status === "initializing" && "初期化中"}
          {status === "running" && "スキャン中"}
          {status === "error" && "エラー"}
        </p>

        {errorMessage && (
          <p className="mt-2 text-sm text-red-600">
            {errorMessage}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">読取結果</h2>

        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-sm">
          {result || "未検出"}
        </pre>
      </section>
    </main>
  );
}
