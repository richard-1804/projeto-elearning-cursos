import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { EnrollmentService } from '../../src/services/EnrollmentService.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError, 
} from '../../src/errors/AppError.js';
import { criarEstudante } from '../factories/studentFactory.js';
import { criarTurma, criarEnrollment } from '../factories/enrollmentFactory.js';

describe('EnrollmentService', () => { // preparação dos dublês de teste
  let enrollmentService; //Instância real do serviço que será testado
  let mockEnrollmentModel; //Banco de dados de matrículas
  let mockClassModel; //Banco de dados de turmas
  let mockCourseModel; //Banco de dados de cursos
  let mockUserModel; //Banco de dados de usuários/estudantes
  let mockEmailGateway; // Serviço externo que envia e-mails
  let mockLogger; // Serviço que grava logs de erros
  let customClock; // Relógio/Data simulada

  const defaultRules = {
    LOCK_DEADLINE_PERCENT: 25, // Só permite trancar a matrícula aos 25% de duração
    MAX_LOCKED_ENROLLMENTS_PER_USER: 2, //só permite ter duas matrículas trancadas
  };

  beforeEach(() => {
    mockEnrollmentModel = {
      getEnrollmentsByUser: jest.fn(),
      createEnrollment: jest.fn(),
      getEnrollmentById: jest.fn(),
      updateEnrollment: jest.fn(),
      countEnrollmentsByUserAndStatus: jest.fn(),
      countEnrollmentsByClassAndStatus: jest.fn(),
    };

    mockClassModel = {
      getClassById: jest.fn(),
    };

    mockCourseModel = {
      getPrerequisitesByCourseId: jest.fn(),
    };

    mockUserModel = {
      findUserById: jest.fn(),
    };

    mockEmailGateway = {
      sendEmail: jest.fn(),
    };

    mockLogger = {
      error: jest.fn(),
    };

    customClock = jest.fn(() => new Date('2026-03-01T10:00:00Z'));

    enrollmentService = new EnrollmentService({ // Instancia o serviço injetando todos os dublês e regras
      enrollmentModel: mockEnrollmentModel,
      classModel: mockClassModel,
      courseModel: mockCourseModel,
      userModel: mockUserModel,
      emailGateway: mockEmailGateway,
      clock: customClock,
      rules: defaultRules,
      logger: mockLogger,
    });
  });

  describe('enroll', () => {
    it('deve efetuar a matrícula e enviar e-mail com sucesso', async () => {
      // Arrange
      const user = criarEstudante();
      const turma = criarTurma({ status: 'OPEN' });
      const createdEnrollment = criarEnrollment({ users_id_fk: user.id_users_pk, classes_id_fk: turma.id_classes_pk });

      mockUserModel.findUserById.mockResolvedValue(user);
      mockClassModel.getClassById.mockResolvedValue(turma);
      mockEnrollmentModel.getEnrollmentsByUser.mockResolvedValue([]);
      mockCourseModel.getPrerequisitesByCourseId.mockResolvedValue([]);
      mockEnrollmentModel.countEnrollmentsByClassAndStatus.mockResolvedValue(0);
      mockEnrollmentModel.createEnrollment.mockResolvedValue(createdEnrollment);
      mockEmailGateway.sendEmail.mockResolvedValue();

      // Act
      const result = await enrollmentService.enroll(user.id_users_pk, turma.id_classes_pk);

      // Assert
      expect(result).toEqual(createdEnrollment);
      expect(mockEmailGateway.sendEmail).toHaveBeenCalledWith({
        to: user.email,
        subject: 'Matrícula confirmada',
        body: `Olá, ${user.name}! Sua matrícula na turma "${turma.name}" foi confirmada.`,
      });
    });

    it('deve manter a matrícula mesmo se o envio de e-mail falhar', async () => {
      // Arrange
      const user = criarEstudante();
      const turma = criarTurma({ status: 'OPEN' });
      const createdEnrollment = criarEnrollment();

      mockUserModel.findUserById.mockResolvedValue(user);
      mockClassModel.getClassById.mockResolvedValue(turma);
      mockEnrollmentModel.getEnrollmentsByUser.mockResolvedValue([]);
      mockCourseModel.getPrerequisitesByCourseId.mockResolvedValue([]);
      mockEnrollmentModel.countEnrollmentsByClassAndStatus.mockResolvedValue(0);
      mockEnrollmentModel.createEnrollment.mockResolvedValue(createdEnrollment);
      mockEmailGateway.sendEmail.mockRejectedValue(new Error('SMTP error'));

      // Act
      const result = await enrollmentService.enroll(user.id_users_pk, turma.id_classes_pk);

      // Assert
      expect(result).toEqual(createdEnrollment);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('deve lançar NotFoundError se o utilizador não existir', async () => {
      // Arrange
      mockUserModel.findUserById.mockResolvedValue(null);

      // Act & Assert
      await expect(enrollmentService.enroll(999, 10)).rejects.toThrow(NotFoundError);
    });

    it('deve lançar NotFoundError se a turma não existir', async () => {
      // Arrange
      mockUserModel.findUserById.mockResolvedValue(criarEstudante());
      mockClassModel.getClassById.mockResolvedValue(null);

      // Act & Assert
      await expect(enrollmentService.enroll(1, 999)).rejects.toThrow(NotFoundError);
    });

    it('deve lançar BusinessRuleError se a turma não estiver OPEN', async () => {
      // Arrange
      mockUserModel.findUserById.mockResolvedValue(criarEstudante());
      mockClassModel.getClassById.mockResolvedValue(criarTurma({ status: 'CLOSED' }));

      // Act & Assert
      await expect(enrollmentService.enroll(1, 10)).rejects.toThrow(BusinessRuleError);
    });

    it('deve lançar ConflictError se a turma estiver lotada', async () => {
      // Arrange
      const user = criarEstudante();
      const turma = criarTurma({ status: 'OPEN', max_students: 30 });

      mockUserModel.findUserById.mockResolvedValue(user);
      mockClassModel.getClassById.mockResolvedValue(turma);
      mockEnrollmentModel.getEnrollmentsByUser.mockResolvedValue([]);
      mockCourseModel.getPrerequisitesByCourseId.mockResolvedValue([]);
      mockEnrollmentModel.countEnrollmentsByClassAndStatus.mockResolvedValue(30);

      // Act & Assert
      await expect(enrollmentService.enroll(user.id_users_pk, turma.id_classes_pk)).rejects.toThrow(ConflictError);
    });

    it('deve lançar BusinessRuleError se o aluno não tiver concluído os pré-requisitos', async () => {
      // Arrange
      const user = criarEstudante();
      const turma = criarTurma({ status: 'OPEN', courses_id_fk: 100 });

      mockUserModel.findUserById.mockResolvedValue(user);
      mockClassModel.getClassById.mockResolvedValue(turma);
      mockEnrollmentModel.getEnrollmentsByUser.mockResolvedValue([]);
      mockCourseModel.getPrerequisitesByCourseId.mockResolvedValue([
        { id_courses_pk: 50, title: 'Lógica de Programação' },
      ]);

      // Act & Assert
      await expect(enrollmentService.enroll(user.id_users_pk, turma.id_classes_pk)).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('lockEnrollment', () => {
    it('deve trancar a matrícula dentro do prazo e limite permitidos', async () => {
      // Arrange
      const startDate = new Date('2026-03-01T00:00:00Z');
      const endDate = new Date('2026-06-01T00:00:00Z');
      const turma = criarTurma({ start_date: startDate, end_date: endDate });
      const enrollment = criarEnrollment({
        status: 'ACTIVE',
        users_id_fk: 1,
        classes: turma,
      });

      mockEnrollmentModel.getEnrollmentById.mockResolvedValue(enrollment);
      mockEnrollmentModel.countEnrollmentsByUserAndStatus.mockResolvedValue(0);
      mockEnrollmentModel.updateEnrollment.mockResolvedValue({
        ...enrollment,
        status: 'LOCKED',
      });

      // Act
      const result = await enrollmentService.lockEnrollment(1, enrollment.id_enrollments_pk);

      // Assert
      expect(result.status).toBe('LOCKED');
      expect(mockEnrollmentModel.updateEnrollment).toHaveBeenCalled();
    });

    it('deve lançar ForbiddenError se a matrícula pertencer a outro utilizador', async () => {
      // Arrange
      const enrollment = criarEnrollment({ users_id_fk: 2 });
      mockEnrollmentModel.getEnrollmentById.mockResolvedValue(enrollment);

      // Act & Assert
      await expect(enrollmentService.lockEnrollment(1, enrollment.id_enrollments_pk)).rejects.toThrow(ForbiddenError);
    });

    it('deve lançar BusinessRuleError se o prazo limite de trancamento for excedido', async () => {
      // Arrange
      const startDate = new Date('2026-01-01T00:00:00Z');
      const endDate = new Date('2026-02-01T00:00:00Z'); // 31 dias de duração
      const turma = criarTurma({ start_date: startDate, end_date: endDate });
      const enrollment = criarEnrollment({ status: 'ACTIVE', users_id_fk: 1, classes: turma });

      // Clock definido para março (muito após os 25% iniciais)
      mockEnrollmentModel.getEnrollmentById.mockResolvedValue(enrollment);

      // Act & Assert
      await expect(enrollmentService.lockEnrollment(1, enrollment.id_enrollments_pk)).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('reactivateEnrollment', () => {
    it('deve reativar a matrícula trancada se houver vagas e a turma estiver aberta', async () => {
      // Arrange
      const turma = criarTurma({ status: 'OPEN', max_students: 30, end_date: new Date('2026-12-31') });
      const enrollment = criarEnrollment({ status: 'LOCKED', users_id_fk: 1, classes: turma });

      mockEnrollmentModel.getEnrollmentById.mockResolvedValue(enrollment);
      mockEnrollmentModel.countEnrollmentsByClassAndStatus.mockResolvedValue(10);
      mockEnrollmentModel.updateEnrollment.mockResolvedValue({
        ...enrollment,
        status: 'ACTIVE',
        locked_at: null,
      });

      // Act
      const result = await enrollmentService.reactivateEnrollment(1, enrollment.id_enrollments_pk);

      // Assert
      expect(result.status).toBe('ACTIVE');
      expect(result.locked_at).toBeNull();
    });

    it('deve lançar ConflictError ao reativar se a turma estiver cheia', async () => {
      // Arrange
      const turma = criarTurma({ status: 'OPEN', max_students: 20, end_date: new Date('2026-12-31') });
      const enrollment = criarEnrollment({ status: 'LOCKED', users_id_fk: 1, classes: turma });

      mockEnrollmentModel.getEnrollmentById.mockResolvedValue(enrollment);
      mockEnrollmentModel.countEnrollmentsByClassAndStatus.mockResolvedValue(20);
      mockEnrollmentModel.countEnrollmentsByUserAndStatus.mockResolvedValue(0); //

      // Act & Assert
      await expect(enrollmentService.reactivateEnrollment(1, enrollment.id_enrollments_pk)).rejects.toThrow(ConflictError);
    });
  });
});
