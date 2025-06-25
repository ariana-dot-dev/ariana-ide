from setuptools import setup
from setuptools_rust import Binding, RustExtension

setup(
    name="cli-coding-agents",
    version="0.1.0",
    author="Ariana Team",
    author_email="team@ariana.dev",
    description="A Python library for wrapping CLI agentic tools like Claude Code",
    long_description=open("README.md").read() if open("README.md") else "",
    long_description_content_type="text/markdown",
    url="https://github.com/ariana-dev/cli-coding-agents",
    rust_extensions=[
        RustExtension(
            "cli_coding_agents",
            binding=Binding.PyO3,
            features=["python"],
            debug=False,
        )
    ],
    packages=[],
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Programming Language :: Rust",
    ],
    python_requires=">=3.8",
    install_requires=[],
    setup_requires=["setuptools-rust"],
    zip_safe=False,
)