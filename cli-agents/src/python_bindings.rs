use pyo3::prelude::*;
use std::path::PathBuf;
use crate::{ClaudeCode, ClaudeCodeInterface, ClaudeCodeTaskResult, TaskResult, Diff, FileChange};

#[pyclass]
struct PyClaudeCode {
    inner: ClaudeCode,
}

#[pyclass]
struct PyTaskResult {
    #[pyo3(get)]
    elapsed: f64, // seconds
    #[pyo3(get)]
    tokens: Option<u64>,
    #[pyo3(get)]
    diff: PyDiff,
}

#[pyclass]
#[derive(Clone)]
struct PyDiff {
    #[pyo3(get)]
    file_changes: Vec<PyFileChange>,
}

#[pyclass]
#[derive(Clone)]
struct PyFileChange {
    #[pyo3(get)]
    absolute_path: String,
    #[pyo3(get)]
    name_and_extension: String,
    #[pyo3(get)]
    original_content: String,
    #[pyo3(get)]
    final_content: String,
    #[pyo3(get)]
    git_style_diff: String,
}

#[pyclass]
struct PyClaudeCodeTask {
    // We'll store the task result when it's ready
    result: Option<ClaudeCodeTaskResult>,
}

impl From<TaskResult> for PyTaskResult {
    fn from(result: TaskResult) -> Self {
        PyTaskResult {
            elapsed: result.elapsed.as_secs_f64(),
            tokens: result.tokens,
            diff: result.diff.into(),
        }
    }
}

impl From<Diff> for PyDiff {
    fn from(diff: Diff) -> Self {
        PyDiff {
            file_changes: diff.file_changes.into_iter().map(|fc| fc.into()).collect(),
        }
    }
}

impl From<FileChange> for PyFileChange {
    fn from(change: FileChange) -> Self {
        PyFileChange {
            absolute_path: change.absolute_path.to_string_lossy().to_string(),
            name_and_extension: change.name_and_extension,
            original_content: change.original_content,
            final_content: change.final_content,
            git_style_diff: change.git_style_diff,
        }
    }
}

#[pymethods]
impl PyClaudeCode {
    #[new]
    fn new(path: &str) -> PyResult<Self> {
        let path_buf = PathBuf::from(path);
        Ok(PyClaudeCode {
            inner: ClaudeCode::new(path_buf),
        })
    }
    
    fn prompt<'py>(&mut self, py: Python<'py>, message: &str) -> PyResult<&'py PyAny> {
        let message = message.to_string();
        let mut claude_code = self.inner.clone(); // We need to clone for async
        
        pyo3_asyncio::tokio::future_into_py(py, async move {
            let task = claude_code.prompt(&message).await;
            let result = task.wait_till_finish().await;
            
            Ok(PyClaudeCodeTask {
                result: Some(result),
            })
        })
    }
    
    #[staticmethod]
    fn is_installed() -> bool {
        ClaudeCode::is_installed()
    }
    
    #[staticmethod]
    fn install<'py>(py: Python<'py>) -> PyResult<&'py PyAny> {
        pyo3_asyncio::tokio::future_into_py(py, async move {
            match ClaudeCode::install().await {
                Ok(_) => Ok(()),
                Err(e) => Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string())),
            }
        })
    }
}

#[pymethods]
impl PyClaudeCodeTask {
    fn wait_till_finish<'py>(&mut self, py: Python<'py>) -> PyResult<&'py PyAny> {
        if let Some(result) = &self.result {
            let result = result.clone();
            return pyo3_asyncio::tokio::future_into_py(py, async move {
                let py_result: PyResult<PyTaskResult> = match result {
                    ClaudeCodeTaskResult::Success(task_result) => Ok(task_result.into()),
                    ClaudeCodeTaskResult::CantStartClaudeCodeNotInstalled => {
                        Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
                            "Claude Code is not installed"
                        ))
                    }
                    ClaudeCodeTaskResult::CantStartLoginRequired => {
                        Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
                            "Login required for Claude Code"
                        ))
                    }
                    ClaudeCodeTaskResult::Error(msg) => {
                        Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(msg))
                    }
                };
                py_result
            });
        }
        
        Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
            "Task not initialized"
        ))
    }
}

// We need to implement Clone for ClaudeCode to make it work with async Python
impl Clone for ClaudeCode {
    fn clone(&self) -> Self {
        Self {
            path: self.path.clone(),
        }
    }
}

#[pymodule]
fn cli_coding_agents(_py: Python<'_>, m: &PyModule) -> PyResult<()> {
    m.add_class::<PyClaudeCode>()?;
    m.add_class::<PyClaudeCodeTask>()?;
    m.add_class::<PyTaskResult>()?;
    m.add_class::<PyDiff>()?;
    m.add_class::<PyFileChange>()?;
    Ok(())
}