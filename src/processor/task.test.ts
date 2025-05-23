import { TaskManager, TaskStatus, TaskConfig } from './task';
import { Mongo } from './mongo';
import { Collection } from 'mongodb';
import { AutoSchedulingRequest } from '../interfaces';

// Mock a specific taskId for consistent testing
const mockTaskId = 'test-task-id-123';

jest.mock('uuid', () => ({
  v4: () => mockTaskId,
}));

const mockCollection = {
  createIndex: jest.fn(),
  insertOne: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(), 
  find: jest.fn().mockReturnThis(), 
  limit: jest.fn().mockReturnThis(),
  toArray: jest.fn(),
};

jest.mock('./mongo', () => {
  return {
    Mongo: jest.fn().mockImplementation(() => {
      return {
        getCollection: jest.fn().mockResolvedValue(mockCollection as unknown as Collection),
      };
    }),
  };
});

describe('TaskManager', () => {
  let taskManager: TaskManager;
  const mockTaskConfig: TaskConfig = {
    TASK_MONGODB_URI: 'mongodb://localhost:27017',
    TASK_MONGODB_DB: 'testdb',
    TASK_MONGODB_COLLECTION: 'tasks',
    TASK_TTL: 3600000, // 1 hour
  };

  beforeEach(() => {
    jest.clearAllMocks();
    taskManager = new TaskManager(mockTaskConfig);
  });

  describe('CreateTask', () => {
    test('should create a task and return its ID', async () => {
      const mockRequest: AutoSchedulingRequest = { date: '2024-01-01', bookings: [] };
      
      (mockCollection.insertOne as jest.Mock).mockResolvedValue({ acknowledged: true, insertedId: mockTaskId });

      const taskId = await taskManager.CreateTask(mockRequest);

      expect(taskId).toBe(mockTaskId);
      expect(Mongo).toHaveBeenCalledWith(mockTaskConfig);
      
      await new Promise(process.nextTick);

      expect(mockCollection.createIndex).toHaveBeenCalledWith({ taskId: 1 }, { unique: true });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ updatedAt: 1 }, { expireAfterSeconds: mockTaskConfig.TASK_TTL / 1000 });
      
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: mockTaskId,
          requestBody: JSON.stringify(mockRequest),
          status: TaskStatus.pending,
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number), 
        })
      );
    });

    test('should throw an error if task creation fails in DB (insertOne rejects)', async () => {
        (mockCollection.insertOne as jest.Mock).mockRejectedValue(new Error('DB insertOne failed'));
        const mockRequest: AutoSchedulingRequest = { date: '2024-01-01', bookings: [] };
        await expect(taskManager.CreateTask(mockRequest)).rejects.toThrow('DB insertOne failed');
    });

    test('should proceed if insertOne acknowledges false but does not throw (though this is unusual)', async () => {
      // This test clarifies behavior if insertOne doesn't throw but signals failure.
      // The current code in task.ts doesn't explicitly check 'acknowledged'.
      // It relies on insertOne throwing for errors or returning a non-error for success.
      (mockCollection.insertOne as jest.Mock).mockResolvedValue({ acknowledged: false, insertedId: mockTaskId });
      const mockRequest: AutoSchedulingRequest = { date: '2024-01-01', bookings: [] };
      
      // Expect it not to throw, and return the taskId, as per current implementation
      const taskId = await taskManager.CreateTask(mockRequest);
      expect(taskId).toBe(mockTaskId); 
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });
  });

  describe('GetTask', () => {
    test('should return task response if task is found', async () => {
      const mockResultPayload = { success: true, data: "some data" };
      const mockDbTask = { 
        taskId: mockTaskId,
        status: TaskStatus.completed,
        responseBody: JSON.stringify(mockResultPayload),
        errorMessage: null,
        requestBody: JSON.stringify({}), 
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
      };
      (mockCollection.findOne as jest.Mock).mockResolvedValue(mockDbTask);

      const taskResponse = await taskManager.GetTask(mockTaskId);

      expect(Mongo).toHaveBeenCalledWith(mockTaskConfig);
      await new Promise(process.nextTick);

      expect(mockCollection.findOne).toHaveBeenCalledWith({ taskId: mockTaskId });
      expect(taskResponse).toEqual({
        taskId: mockTaskId,
        status: TaskStatus.completed,
        result: mockResultPayload, 
        error: undefined, 
      });
    });

    test('should return task response with error if task failed', async () => {
        const mockErrorMsg = "Task processing failed";
        const mockDbTask = { 
          taskId: mockTaskId,
          status: TaskStatus.failed,
          responseBody: null, // Or undefined
          errorMessage: mockErrorMsg,
          requestBody: JSON.stringify({}), 
          createdAt: new Date().getTime(),
          updatedAt: new Date().getTime(),
        };
        (mockCollection.findOne as jest.Mock).mockResolvedValue(mockDbTask);
  
        const taskResponse = await taskManager.GetTask(mockTaskId);
  
        expect(Mongo).toHaveBeenCalledWith(mockTaskConfig);
        await new Promise(process.nextTick);
  
        expect(mockCollection.findOne).toHaveBeenCalledWith({ taskId: mockTaskId });
        expect(taskResponse).toEqual({
          taskId: mockTaskId,
          status: TaskStatus.failed,
          result: undefined, 
          error: mockErrorMsg, 
        });
      });

    test('should return null if task is not found', async () => {
      (mockCollection.findOne as jest.Mock).mockResolvedValue(null);

      const taskResponse = await taskManager.GetTask(mockTaskId);
      
      expect(Mongo).toHaveBeenCalledWith(mockTaskConfig);
      await new Promise(process.nextTick);

      expect(mockCollection.findOne).toHaveBeenCalledWith({ taskId: mockTaskId });
      expect(taskResponse).toBeNull();
    });
  });
});
