import { Modal, Button, Form, Input } from "antd";
import { useRef, useState } from "react";

const AddDatasetModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload = {
        name: values.name,
        description: values.description,
        file,
      };

      console.log("Dataset submitted:", payload);

      // reset & close
      form.resetFields();
      setFile(null);
      setOpen(false);
    } catch (err) {
      // validation error – do nothing
    }
  };

  return (
    <>
      {/* Open Modal Button */}
      <Button type="primary" onClick={() => setOpen(true)}>
        Add Dataset
      </Button>

      {/* Modal */}
      <Modal
        title="Add New Dataset"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        okText="Add Dataset"
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          {/* Dataset Name */}
          <Form.Item
            label="Dataset Name"
            name="name"
            rules={[{ required: true, message: "Dataset name is required" }]}
          >
            <Input placeholder="e.g. European Bird Calls – Spring" />
          </Form.Item>

          {/* Description */}
          <Form.Item label="Description" name="description">
            <Input.TextArea
              rows={3}
              placeholder="Optional description of this dataset"
            />
          </Form.Item>

          {/* File Upload */}
          <div className="mt-2">
            <label
              htmlFor="audio-upload"
              className="
                block p-6 border-2 border-dashed border-gray-300 rounded-lg
                hover:border-blue-400 hover:bg-blue-50
                transition-all cursor-pointer text-center
              "
            >
              <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-2xl text-blue-600">📁</span>
              </div>

              <p className="text-sm font-medium text-gray-900 mb-1">
                {file ? file.name : "Upload audio dataset file"}
              </p>
              <p className="text-xs text-gray-500">WAV / ZIP supported</p>

              <input
                id="audio-upload"
                ref={fileInputRef}
                type="file"
                accept="audio/wav,audio/*,.zip"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default AddDatasetModal;
