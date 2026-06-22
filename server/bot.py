#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""stt-js - Pipecat Speech-to-Text Demo

This bot uses a minimal pipeline: audio in → Speech-to-Text → transcript out.
There is no LLM and no TTS — the bot only transcribes what the user says and
streams the transcript back to the client over the data channel.

Required AI services:
- Deepgram (Speech-to-Text)

Run the bot using::

    uv run bot.py
"""

import os

from dotenv import load_dotenv
from loguru import logger
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.workers.runner import WorkerRunner

load_dotenv(override=True)


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments) -> None:
    """Run the speech-to-text session for this client.

    Args:
        transport: The transport for this session, built by ``create_transport``.
        runner_args: Runner session arguments. Carries the request ``body`` and
            ``session_id``; this simple pipeline doesn't need them.
    """
    logger.info("Starting bot")

    # Speech-to-Text service — this is the only processing stage.
    # As Deepgram returns interim and final results, the pipeline emits
    # InterimTranscriptionFrame / TranscriptionFrame frames, which the
    # worker's RTVI integration automatically forwards to the client as
    # `onUserTranscript` events — no LLM or TTS required.
    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    # Pipeline: mic audio in -> STT -> transcript frames back out
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            transport.output(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[],
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False)

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point."""

    transport_params = {
	"daily": lambda: TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=False,
        ),
        # No audio_out needed — the bot never speaks, it only listens.
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=False,
        ),
    }

    transport = await create_transport(runner_args, transport_params)

    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
