use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct AppState {
    cancelled_tasks: Arc<Mutex<HashSet<String>>>,
    temp_files: Arc<Mutex<HashSet<PathBuf>>>,
}

impl AppState {
    pub fn cancelled_tasks(&self) -> Arc<Mutex<HashSet<String>>> {
        Arc::clone(&self.cancelled_tasks)
    }

    pub fn cancel_task(&self, task_id: &str) {
        if let Ok(mut tasks) = self.cancelled_tasks.lock() {
            tasks.insert(task_id.to_string());
        }
    }

    pub fn clear_task(&self, task_id: &str) {
        if let Ok(mut tasks) = self.cancelled_tasks.lock() {
            tasks.remove(task_id);
        }
    }

    pub fn is_cancelled(&self, task_id: &str) -> bool {
        self.cancelled_tasks
            .lock()
            .map(|tasks| tasks.contains(task_id))
            .unwrap_or(false)
    }

    pub fn register_temp_file(&self, path: PathBuf) {
        if let Ok(mut files) = self.temp_files.lock() {
            files.insert(path);
        }
    }

    pub fn take_temp_file(&self, path: &PathBuf) -> bool {
        self.temp_files
            .lock()
            .map(|mut files| files.remove(path))
            .unwrap_or(false)
    }
}
